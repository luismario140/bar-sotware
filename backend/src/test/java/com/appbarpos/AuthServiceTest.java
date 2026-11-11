package com.appbarpos;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.appbarpos.auth.application.AuthException;
import com.appbarpos.auth.application.AuthService;
import com.appbarpos.auth.repository.AdministratorRepository;
import com.appbarpos.infrastructure.security.PinHashConfiguration;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.sqlite.SQLiteDataSource;

class AuthServiceTest {
    @TempDir Path root;
    SQLiteDataSource source;
    JdbcTemplate jdbc;
    AdministratorRepository repository;
    MutableClock clock;
    AuthService service;

    @BeforeEach
    void initialize() {
        source = new SQLiteDataSource();
        source.setUrl("jdbc:sqlite:" + root.resolve("auth.db"));
        Flyway.configure().dataSource(source).locations("classpath:db/migration").load().migrate();
        jdbc = new JdbcTemplate(source);
        repository = new AdministratorRepository(jdbc);
        clock = new MutableClock();
        service = newService();
        service.setup("test-user", "001234");
    }

    AuthService newService() {
        return new AuthService(repository, new PinHashConfiguration().pinEncoder(),
                new DataSourceTransactionManager(source), clock, 5, 60);
    }

    @Test
    void persistedLockSurvivesServiceRestartAndExpiresWithoutSleeping() {
        for (int index = 0; index < 5; index++) {
            assertThatThrownBy(() -> service.login("test-user", "999999")).isInstanceOf(AuthException.class);
        }
        AuthService restarted = newService();
        assertThatThrownBy(() -> restarted.login("test-user", "001234"))
                .isInstanceOfSatisfying(AuthException.class, exception -> assertThat(exception.code()).isEqualTo("LOCKED"));
        clock.advance(61000);
        assertThat(restarted.login("test-user", "001234").id()).isEqualTo(1);
        assertThat(repository.find().orElseThrow().lockedUntil()).isZero();
    }

    @Test
    void auditFailureRollsBackCredentialChangeAndPreservesOldPin() {
        jdbc.execute("CREATE TRIGGER fail_change BEFORE INSERT ON administrator_audit " +
                "WHEN NEW.action = 'CREDENTIALS_CHANGED' BEGIN SELECT RAISE(ABORT, 'controlled failure'); END");
        assertThatThrownBy(() -> service.change(1, "001234", "changed-user", "987654"))
                .isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(repository.find().orElseThrow().credentialVersion()).isEqualTo(1);
        assertThat(service.login("test-user", "001234").username()).isEqualTo("test-user");
    }

    @Test
    void invalidInputsDoNotChangeIdentityAndHistoryCannotBeDeleted() {
        assertThatThrownBy(() -> service.change(1, "001234", "", "1234")).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> service.change(1, "001234", "test-user", "abcd")).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> service.setup("second-user", "1234")).isInstanceOf(AuthException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM administrator")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThatThrownBy(() -> jdbc.update("DELETE FROM administrator_audit")).isInstanceOf(org.springframework.dao.DataAccessException.class);
        assertThat(repository.find().orElseThrow().username()).isEqualTo("test-user");
    }

    static final class MutableClock extends Clock {
        long now = Instant.parse("2026-01-01T00:00:00Z").toEpochMilli();
        void advance(long millis) { now += millis; }
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now); }
        @Override public long millis() { return now; }
    }
}
