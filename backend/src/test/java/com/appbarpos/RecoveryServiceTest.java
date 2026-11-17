package com.appbarpos;

import static org.assertj.core.api.Assertions.*;

import com.appbarpos.auth.application.*;
import com.appbarpos.auth.repository.AdministratorRepository;
import com.appbarpos.infrastructure.security.PinHashConfiguration;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.sqlite.SQLiteDataSource;

class RecoveryServiceTest {
    @TempDir Path root;
    JdbcTemplate jdbc;
    AdministratorRepository repository;
    DataSourceTransactionManager manager;
    PasswordEncoder encoder = new PinHashConfiguration().pinEncoder();
    AuthServiceTest.MutableClock clock = new AuthServiceTest.MutableClock();
    Mailbox mail = new Mailbox();
    AuthService auth;
    RecoveryService recovery;
    final String email = "admin@example.com";

    @BeforeEach void initialize() {
        var source = new SQLiteDataSource();
        source.setUrl("jdbc:sqlite:" + root.resolve("recovery.db"));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = new JdbcTemplate(source);
        repository = new AdministratorRepository(jdbc);
        manager = new DataSourceTransactionManager(source);
        auth = new AuthService(repository, encoder, manager, clock, 5, 60);
        auth.setup("operator", "0012", email);
        recovery = restarted();
    }

    RecoveryService restarted() { return new RecoveryService(repository, jdbc, encoder, clock, mail, Runnable::run, manager); }
    String code() { return mail.codes.getLast(); }

    @Test void deliversCodeWithoutExposingPinAndAllowsOneResetOnly() {
        recovery.request(email);
        assertThat(code()).matches("[0-9]{8}");
        String stored = jdbc.queryForObject("SELECT code_hash FROM administrator_recovery", String.class);
        assertThat(stored).doesNotContain(code());
        assertThat(encoder.matches(code(), stored)).isTrue();
        assertThat(mail.recipient).isEqualTo(email);
        assertThat(mail.username).isEqualTo("operator");
        recovery.reset(email, code(), "0000");
        assertThat(auth.login("operator", "0000").credentialVersion()).isEqualTo(2);
        assertThatThrownBy(() -> recovery.reset(email, code(), "1234")).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> auth.login("operator", "0012")).isInstanceOf(AuthException.class);
    }

    @Test void expiresAfterTenMinutesWithoutChangingPin() {
        recovery.request(email);
        clock.advance(600000);
        assertThatThrownBy(() -> restarted().reset(email, code(), "9876")).isInstanceOf(AuthException.class);
        assertThat(auth.login("operator", "0012").credentialVersion()).isEqualTo(1);
    }

    @Test void fiveFailedGuessesInvalidateCodeAndSurviveRestart() {
        recovery.request(email);
        String wrong = code().equals("99999999") ? "00000000" : "99999999";
        for (int attempt = 0; attempt < 5; attempt++) {
            assertThatThrownBy(() -> restarted().reset(email, wrong, "9876")).isInstanceOf(AuthException.class);
        }
        assertThatThrownBy(() -> recovery.reset(email, code(), "9876")).isInstanceOf(AuthException.class);
        assertThat(auth.login("operator", "0012").credentialVersion()).isEqualTo(1);
    }

    @Test void resendingReplacesHashAndChangingCredentialsRevokesCode() {
        recovery.request(email);
        String oldHash = jdbc.queryForObject("SELECT code_hash FROM administrator_recovery", String.class);
        clock.advance(60000);
        recovery.request(email);
        assertThat(jdbc.queryForObject("SELECT code_hash FROM administrator_recovery", String.class)).isNotEqualTo(oldHash);
        auth.change(1, "0012", "operator", "0012", "new@example.com");
        assertThatThrownBy(() -> recovery.reset(email, code(), "9876")).isInstanceOf(AuthException.class);
        assertThat(auth.login("operator", "0012").recoveryEmail()).isEqualTo("new@example.com");
    }

    @Test void requestLimitsPersistAndAllowFivePerHourAtMost() {
        recovery.request(email);
        assertThatThrownBy(() -> restarted().request(email)).isInstanceOfSatisfying(AuthException.class,
                failure -> assertThat(failure.retryAfterSeconds()).isEqualTo(60));
        for (int index = 0; index < 4; index++) { clock.advance(60000); restarted().request(email); }
        clock.advance(60000);
        assertThatThrownBy(() -> restarted().request(email)).isInstanceOfSatisfying(AuthException.class,
                failure -> assertThat(failure.code()).isEqualTo("LOCKED"));
        assertThat(mail.codes).hasSize(5);
        clock.advance(3600000);
        restarted().request(email);
        assertThat(mail.codes).hasSize(6);
    }

    @Test void unknownEmailDoesNotSendOrRevealRegisteredAddress() {
        recovery.request("unknown@example.com");
        assertThat(mail.codes).isEmpty();
        assertThat(jdbc.queryForObject("SELECT code_hash FROM administrator_recovery", String.class)).isNull();
        clock.advance(60000);
        recovery.request(email);
        assertThat(mail.codes).hasSize(1);
        assertThatThrownBy(() -> recovery.reset("unknown@example.com", code(), "9876")).isInstanceOf(AuthException.class);
    }

    @Test void absentOrFailedMailerDoesNotChangePin() {
        mail.ready = false;
        assertThatThrownBy(() -> recovery.request(email)).isInstanceOfSatisfying(AuthException.class,
                failure -> assertThat(failure.code()).isEqualTo("MAIL_UNAVAILABLE"));
        mail.ready = true;
        mail.fail = true;
        recovery.request(email);
        assertThat(jdbc.queryForObject("SELECT code_hash FROM administrator_recovery", String.class)).isNull();
        assertThat(auth.login("operator", "0012").credentialVersion()).isEqualTo(1);
    }

    @Test void auditFailureRollsBackResetAndPreservesCodeForRetry() {
        recovery.request(email);
        jdbc.execute("CREATE TRIGGER fail_reset BEFORE INSERT ON administrator_audit WHEN NEW.action = 'CREDENTIALS_CHANGED' BEGIN SELECT RAISE(ABORT, 'test'); END");
        assertThatThrownBy(() -> recovery.reset(email, code(), "9876")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(auth.login("operator", "0012").credentialVersion()).isEqualTo(1);
        jdbc.execute("DROP TRIGGER fail_reset");
        recovery.reset(email, code(), "9876");
        assertThat(auth.login("operator", "9876").credentialVersion()).isEqualTo(2);
    }

    @Test void validatesEmailAndExistingAdminsCanRegisterOneWithTheirCurrentPin() {
        for (String invalid : new String[]{null, "", "bad", "a@b.com\r\nBcc:c@d.com", "Name <a@b.com>"}) {
            assertThatThrownBy(() -> auth.change(1, "0012", "operator", "0012", invalid)).isInstanceOf(AuthException.class);
        }
        jdbc.update("UPDATE administrator SET recovery_email = NULL");
        assertThatThrownBy(() -> auth.change(1, "9999", "operator", "0012", email)).isInstanceOf(AuthException.class);
        assertThat(repository.find().orElseThrow().recoveryEmail()).isNull();
        auth.change(1, "0012", "operator", "0012", email);
        assertThat(repository.find().orElseThrow().recoveryEmail()).isEqualTo(email);
    }

    static class Mailbox implements RecoveryMailSender {
        boolean ready = true;
        boolean fail;
        String recipient;
        String username;
        List<String> codes = new ArrayList<>();
        public boolean available() { return ready; }
        public void send(String email, String username, String code) {
            if (fail) throw new IllegalStateException("sensitive-provider-details");
            recipient = email; this.username = username; codes.add(code);
        }
    }
}
