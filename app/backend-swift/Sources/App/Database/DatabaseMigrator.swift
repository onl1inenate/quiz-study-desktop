import Fluent
import SQLKit
import Vapor

struct EnsureSchemaMigration: Migration {
    func prepare(on database: Database) -> EventLoopFuture<Void> {
        createFolders(on: database)
            .flatMap { self.createDecks(on: database) }
            .flatMap { self.ensureDeckSourceText(on: database) }
            .flatMap { self.ensureDeckFolderId(on: database) }
            .flatMap { self.createQuestions(on: database) }
            .flatMap { self.ensureQuestionLearningContent(on: database) }
            .flatMap { self.createMastery(on: database) }
            .flatMap { self.createAttempts(on: database) }
    }

    func revert(on database: Database) -> EventLoopFuture<Void> {
        database.eventLoop.makeSucceededFuture(())
    }

    private func createFolders(on database: Database) -> EventLoopFuture<Void> {
        database.sql().raw(
            """
            CREATE TABLE IF NOT EXISTS "Folders" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
            );
            """
        ).run()
    }

    private func createDecks(on database: Database) -> EventLoopFuture<Void> {
        database.sql().raw(
            """
            CREATE TABLE IF NOT EXISTS "Decks" (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                source_text TEXT DEFAULT '',
                folderId TEXT,
                createdAt INTEGER DEFAULT (strftime('%s','now') * 1000)
            );
            """
        ).run()
    }

    private func ensureDeckSourceText(on database: Database) -> EventLoopFuture<Void> {
        hasColumn("source_text", in: "Decks", on: database).flatMap { exists in
            guard !exists else {
                return database.eventLoop.makeSucceededFuture(())
            }
            return database.sql().raw(
                """ALTER TABLE "Decks" ADD COLUMN "source_text" TEXT DEFAULT ''"""
            ).run()
        }
    }

    private func ensureDeckFolderId(on database: Database) -> EventLoopFuture<Void> {
        hasColumn("folderId", in: "Decks", on: database).flatMap { exists in
            guard !exists else {
                return database.eventLoop.makeSucceededFuture(())
            }
            return database.sql().raw(
                """ALTER TABLE "Decks" ADD COLUMN "folderId" TEXT"""
            ).run()
        }
    }

    private func createQuestions(on database: Database) -> EventLoopFuture<Void> {
        database.sql().raw(
            """
            CREATE TABLE IF NOT EXISTS "Questions" (
                id TEXT PRIMARY KEY,
                deckId TEXT NOT NULL,
                type TEXT NOT NULL,
                prompt TEXT NOT NULL,
                options TEXT,
                correct_answer TEXT,
                explanation TEXT,
                learning_content TEXT,
                tags TEXT,
                difficulty INTEGER DEFAULT 3
            );
            """
        ).run()
    }

    private func ensureQuestionLearningContent(on database: Database) -> EventLoopFuture<Void> {
        hasColumn("learning_content", in: "Questions", on: database).flatMap { exists in
            guard !exists else {
                return database.eventLoop.makeSucceededFuture(())
            }
            return database.sql().raw(
                """ALTER TABLE "Questions" ADD COLUMN "learning_content" TEXT"""
            ).run()
        }
    }

    private func createMastery(on database: Database) -> EventLoopFuture<Void> {
        database.sql().raw(
            """
            CREATE TABLE IF NOT EXISTS "Mastery" (
                questionId TEXT PRIMARY KEY,
                correctCount INTEGER DEFAULT 0
            );
            """
        ).run()
    }

    private func createAttempts(on database: Database) -> EventLoopFuture<Void> {
        database.sql().raw(
            """
            CREATE TABLE IF NOT EXISTS "Attempts" (
                id TEXT PRIMARY KEY,
                questionId TEXT NOT NULL,
                userAnswer TEXT,
                correct INTEGER,
                ts INTEGER
            );
            """
        ).run()
    }

    private func hasColumn(_ column: String, in table: String, on database: Database) -> EventLoopFuture<Bool> {
        let query: SQLQueryString = "PRAGMA table_info(\(identifier: table))"
        return database.sql().raw(query).all().map { rows in
            rows.contains { row in
                row.column("name")?.string == column
            }
        }
    }
}

enum DatabaseMigrator {
    static func configure(_ app: Application) {
        app.migrations.add(EnsureSchemaMigration())
    }
}
