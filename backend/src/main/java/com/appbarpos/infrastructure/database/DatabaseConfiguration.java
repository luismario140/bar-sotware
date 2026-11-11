package com.appbarpos.infrastructure.database;

import com.appbarpos.infrastructure.storage.AppDataPaths;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.flywaydb.core.Flyway;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.sqlite.SQLiteConfig;
import org.sqlite.SQLiteDataSource;

@Configuration
public class DatabaseConfiguration {
    @Bean(destroyMethod = "close")
    public HikariDataSource dataSource(AppDataPaths paths) {
        SQLiteConfig sqlite = new SQLiteConfig();
        sqlite.enforceForeignKeys(true);
        sqlite.setJournalMode(SQLiteConfig.JournalMode.WAL);
        sqlite.setSynchronous(SQLiteConfig.SynchronousMode.FULL);
        sqlite.setBusyTimeout(5000);
        SQLiteDataSource source = new SQLiteDataSource(sqlite);
        source.setUrl("jdbc:sqlite:" + paths.database());

        HikariConfig pool = new HikariConfig();
        pool.setDataSource(source);
        pool.setPoolName("appbarpos-sqlite");
        pool.setMaximumPoolSize(1);
        pool.setMinimumIdle(1);
        pool.setConnectionTimeout(10000);
        return new HikariDataSource(pool);
    }

    @Bean(initMethod = "migrate")
    public Flyway flyway(DataSource dataSource, AppDataPaths paths) throws Exception {
        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .validateMigrationNaming(true)
                .validateOnMigrate(true)
                .cleanDisabled(true)
                .ignoreMigrationPatterns(new String[0])
                .load();
        if (flyway.info().pending().length > 0) {
            boolean existing;
            try (var connection = dataSource.getConnection(); var statement = connection.createStatement();
                 var result = statement.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")) {
                existing = result.next() && result.getInt(1) > 0;
            }
            if (existing) MigrationBackup.create(dataSource, paths);
        }
        return flyway;
    }
}
