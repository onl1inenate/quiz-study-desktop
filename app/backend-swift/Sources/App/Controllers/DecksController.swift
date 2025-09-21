import Fluent
import SQLKit
import Vapor

final class DecksController {
    func boot(routes: RoutesBuilder) throws {
        routes.get(use: list)
        routes.post(use: create)
        routes.get(":id", use: fetch)
        routes.put(":id", use: update)
        routes.post(":id", "reset", use: reset)
        routes.delete(":id", use: remove)
    }

    func list(req: Request) async throws -> DeckListResponse {
        let rows = try await req.db.sql().raw(
            """
            SELECT id, name
            FROM "Decks"
            ORDER BY createdAt DESC
            """
        ).all(decoding: DeckRow.self)

        var decks: [DeckSummary] = []
        decks.reserveCapacity(rows.count)

        for row in rows {
            guard let deckId = UUID(uuidString: row.id) else {
                req.logger.warning("Skipping deck with invalid UUID: \(row.id)")
                continue
            }

            let metrics = try await deckMetrics(for: deckId, on: req)
            let summary = DeckSummary(
                id: deckId,
                name: row.name,
                totalQuestions: metrics.total,
                mastered: metrics.mastered,
                completed: metrics.completed,
                unmastered: max(0, metrics.total - metrics.mastered - metrics.completed)
            )
            decks.append(summary)
        }

        return DeckListResponse(decks: decks)
    }

    func create(req: Request) async throws -> CreateDeckResponse {
        throw Abort(.notImplemented)
    }

    func fetch(req: Request) async throws -> DeckDetailResponse {
        let deckId = try req.parameters.require("id", as: UUID.self)
        guard let row = try await req.db.sql().raw(
            """
            SELECT id, name, source_text, folderId
            FROM "Decks"
            WHERE id = \(bind: deckId.uuidString)
            LIMIT 1
            """
        ).first(decoding: DeckRecord.self) else {
            throw Abort(.notFound, reason: "Deck not found")
        }

        let metrics = try await deckMetrics(for: deckId, on: req)
        return DeckDetailResponse(
            id: deckId,
            name: row.name,
            text: row.sourceText ?? "",
            folderId: row.folderId.flatMap(UUID.init(uuidString:)),
            totalQuestions: metrics.total,
            completed: metrics.completed,
            mastered: metrics.mastered,
            unmastered: max(0, metrics.total - metrics.mastered - metrics.completed)
        )
    }

    func update(req: Request) async throws -> UpdateDeckResponse {
        throw Abort(.notImplemented)
    }

    func reset(req: Request) async throws -> OKResponse {
        let deckId = try req.parameters.require("id", as: UUID.self)
        guard try await deckExists(deckId, on: req) else {
            throw Abort(.notFound, reason: "Deck not found")
        }

        try await req.db.sql().raw(
            """
            DELETE FROM "Mastery"
            WHERE questionId IN (
                SELECT id FROM "Questions" WHERE deckId = \(bind: deckId.uuidString)
            )
            """
        ).run()

        try await req.db.sql().raw(
            """
            DELETE FROM "Attempts"
            WHERE questionId IN (
                SELECT id FROM "Questions" WHERE deckId = \(bind: deckId.uuidString)
            )
            """
        ).run()

        return OKResponse()
    }

    func remove(req: Request) async throws -> OKResponse {
        let deckId = try req.parameters.require("id", as: UUID.self)

        try await req.db.sql().raw(
            """
            DELETE FROM "Mastery"
            WHERE questionId IN (
                SELECT id FROM "Questions" WHERE deckId = \(bind: deckId.uuidString)
            )
            """
        ).run()

        try await req.db.sql().raw(
            """
            DELETE FROM "Questions"
            WHERE deckId = \(bind: deckId.uuidString)
            """
        ).run()

        try await req.db.sql().raw(
            """
            DELETE FROM "Decks"
            WHERE id = \(bind: deckId.uuidString)
            """
        ).run()

        return OKResponse()
    }

    private func deckExists(_ deckId: UUID, on req: Request) async throws -> Bool {
        try await req.db.sql().raw(
            """
            SELECT 1 FROM "Decks"
            WHERE id = \(bind: deckId.uuidString)
            LIMIT 1
            """
        ).first() != nil
    }

    private func deckMetrics(for deckId: UUID, on req: Request) async throws -> DeckMetrics {
        let total = try await count(
            on: req,
            """
            SELECT COUNT(*) as n
            FROM "Questions"
            WHERE deckId = \(bind: deckId.uuidString)
            """
        )

        let completed = try await count(
            on: req,
            """
            SELECT COUNT(*) as n
            FROM "Questions" q
            JOIN "Mastery" m ON m.questionId = q.id
            WHERE q.deckId = \(bind: deckId.uuidString) AND m.correctCount = 1
            """
        )

        let mastered = try await count(
            on: req,
            """
            SELECT COUNT(*) as n
            FROM "Questions" q
            JOIN "Mastery" m ON m.questionId = q.id
            WHERE q.deckId = \(bind: deckId.uuidString) AND m.correctCount >= 2
            """
        )

        return DeckMetrics(total: total, completed: completed, mastered: mastered)
    }

    private func count(on req: Request, _ query: SQLQueryString) async throws -> Int {
        struct CountRow: Decodable { let n: Int64 }
        let row = try await req.db.sql().raw(query).first(decoding: CountRow.self)
        return row.map { Int($0.n) } ?? 0
    }
}

private struct DeckRow: Decodable {
    let id: String
    let name: String
}

private struct DeckRecord: Decodable {
    let id: String
    let name: String
    let sourceText: String?
    let folderId: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case sourceText = "source_text"
        case folderId
    }
}

private struct DeckMetrics {
    let total: Int
    let completed: Int
    let mastered: Int
}

struct DeckListResponse: Content {
    let decks: [DeckSummary]
}

struct DeckSummary: Content {
    let id: UUID
    let name: String
    let totalQuestions: Int
    let mastered: Int
    let completed: Int
    let unmastered: Int
}

struct CreateDeckResponse: Content {
    let deckId: UUID
    let countsByType: [QuestionTypeCount]
}

struct QuestionTypeCount: Content {
    let type: String
    let n: Int
}

struct DeckDetailResponse: Content {
    let id: UUID
    let name: String
    let text: String
    let folderId: UUID?
    let totalQuestions: Int
    let completed: Int
    let mastered: Int
    let unmastered: Int
}

struct UpdateDeckResponse: Content {
    let ok: Bool
    let total: Int?
    let countsByType: [QuestionTypeCount]?
}

struct OKResponse: Content {
    let ok: Bool
    init(ok: Bool = true) {
        self.ok = ok
    }
}
