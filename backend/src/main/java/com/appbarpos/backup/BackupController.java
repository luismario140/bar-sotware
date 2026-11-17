package com.appbarpos.backup;

import com.appbarpos.auth.application.AuthException;
import com.appbarpos.auth.application.AuthService;
import com.appbarpos.auth.application.AuthSessions;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/backups")
public class BackupController {
    private final BackupService backups;
    private final AuthSessions sessions;
    private final AuthService auth;
    public BackupController(BackupService backups, AuthSessions sessions, AuthService auth) { this.backups = backups; this.sessions = sessions; this.auth = auth; }

    @GetMapping public List<BackupService.BackupFile> list() throws Exception { return backups.list(); }
    @PostMapping("/create") public BackupService.BackupFile create() throws Exception { return backups.create("manual"); }
    @PostMapping("/inspect") public BackupService.InspectedBackup inspect(@RequestBody Inspect input) throws Exception { return backups.inspect(input.path()); }
    @PostMapping("/prepare-restore") public BackupService.PreparedRestore prepare(@RequestBody Restore input, HttpServletRequest request) throws Exception {
        var admin = sessions.require(request);
        auth.confirmPin(admin.credentialVersion(), input.currentPin());
        return backups.prepare(input.id());
    }
    @PostMapping("/cancel-restore") public ResponseEntity<Void> cancel() throws Exception { backups.cancel(); return ResponseEntity.noContent().build(); }

    @ExceptionHandler(BackupException.class) ResponseEntity<Error> invalid(BackupException failure) {
        return ResponseEntity.badRequest().body(new Error("INVALID_BACKUP", failure.getMessage(), 0));
    }
    @ExceptionHandler(AuthException.class) ResponseEntity<Error> rejected(AuthException failure) {
        var response = ResponseEntity.status(failure.status());
        if (failure.retryAfterSeconds() > 0) response.header("Retry-After", Long.toString(failure.retryAfterSeconds()));
        return response.body(new Error(failure.code(), failure.getMessage(), failure.retryAfterSeconds()));
    }
    @ExceptionHandler(Exception.class) ResponseEntity<Error> failed(Exception failure) {
        return ResponseEntity.status(503).body(new Error("BACKUP_UNAVAILABLE", "No se pudo completar el respaldo. Comprueba el espacio y los permisos del equipo e inténtalo de nuevo.", 0));
    }
    public record Inspect(String path) { }
    public record Restore(String id, String currentPin) { @Override public String toString() { return "Restore[REDACTED]"; } }
    public record Error(String code, String message, long retryAfterSeconds) { }
}
