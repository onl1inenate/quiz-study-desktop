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
        let payload = try req.content.decode(CreateDeckRequest.self)
        try payload.validate()

        let deckId = UUID()
        try await req.db.sql().raw(
            """
            INSERT INTO "Decks" (id, name, source_text, folderId)
            VALUES (\(bind: deckId.uuidString), \(bind: payload.name), \(bind: payload.text), \(bind: payload.folderId?.uuidString))
            """
        ).run()

        do {
            let questions = try await AIQuestionGenerator.generateBatch(text: payload.text, batchSize: 75, on: req)
            try await insertGeneratedQuestions(questions, deckId: deckId, on: req)
            let counts = try await questionCounts(for: deckId, on: req)
            return CreateDeckResponse(deckId: deckId, countsByType: counts)
        } catch {
            req.logger.error("POST /decks error: \(error.localizedDescription)")
            throw Abort(.internalServerError, reason: error.localizedDescription)
        }
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
        let deckId = try req.parameters.require("id", as: UUID.self)
        let payload = try req.content.decode(UpdateDeckRequest.self)
        try payload.validate()

        guard try await deckExists(deckId, on: req) else {
            throw Abort(.notFound, reason: "Deck not found")
        }

        if let name = payload.name {
            try await req.db.sql().raw(
                """
                UPDATE "Decks"
                SET name = \(bind: name)
                WHERE id = \(bind: deckId.uuidString)
                """
            ).run()
        }

        if let text = payload.text {
            try await req.db.sql().raw(
                """
                UPDATE "Decks"
                SET source_text = \(bind: text)
                WHERE id = \(bind: deckId.uuidString)
                """
            ).run()
        }

        if let folderIdField = payload.folderId {
            try await req.db.sql().raw(
                """
                UPDATE "Decks"
                SET folderId = \(bind: folderIdField.value?.uuidString)
                WHERE id = \(bind: deckId.uuidString)
                """
            ).run()
        }

        guard payload.shouldRegenerate else {
            return UpdateDeckResponse(ok: true, total: nil, countsByType: nil)
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
            DELETE FROM "Questions"
            WHERE deckId = \(bind: deckId.uuidString)
            """
        ).run()

        let sourceText: String
        if let text = payload.text {
            sourceText = text
        } else {
            let row = try await req.db.sql().raw(
                """
                SELECT source_text
                FROM "Decks"
                WHERE id = \(bind: deckId.uuidString)
                LIMIT 1
                """
            ).first(decoding: DeckSourceRow.self)
            sourceText = row?.sourceText ?? ""
        }

        do {
            let questions = try await AIQuestionGenerator.generateBatch(
                text: sourceText,
                batchSize: payload.batchSize,
                on: req
            )
            try await insertGeneratedQuestions(questions, deckId: deckId, on: req)
        } catch {
            req.logger.error("PUT /decks/:id regenerate error: \(error.localizedDescription)")
            throw Abort(.internalServerError, reason: error.localizedDescription)
        }

        let total = try await count(
            on: req,
            """
            SELECT COUNT(*) as n
            FROM "Questions"
            WHERE deckId = \(bind: deckId.uuidString)
            """
        )

        let counts = try await questionCounts(for: deckId, on: req)
        return UpdateDeckResponse(ok: true, total: total, countsByType: counts)
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

    private func insertGeneratedQuestions(_ questions: [AIGeneratedQuestion], deckId: UUID, on req: Request) async throws {
        for question in questions {
            _ = try await req.insertQuestion(
                InsertQuestion(
                    deckId: deckId,
                    type: question.type.rawValue,
                    prompt: question.prompt,
                    options: question.options,
                    correctAnswer: question.correctAnswer,
                    explanation: question.explanation,
                    learningContent: question.learningContent,
                    tags: question.tags,
                    difficulty: question.difficulty
                )
            )
        }
    }

    private func questionCounts(for deckId: UUID, on req: Request) async throws -> [QuestionTypeCount] {
        let rows = try await req.db.sql().raw(
            """
            SELECT type, COUNT(*) as n
            FROM "Questions"
            WHERE deckId = \(bind: deckId.uuidString)
            GROUP BY type
            """
        ).all(decoding: QuestionTypeCountRow.self)

        return rows.map { QuestionTypeCount(type: $0.type, n: Int($0.n)) }
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

private struct DeckSourceRow: Decodable {
    let sourceText: String

    enum CodingKeys: String, CodingKey {
        case sourceText = "source_text"
    }
}

private struct QuestionTypeCountRow: Decodable {
    let type: String
    let n: Int64
}

struct CreateDeckRequest: Content {
    let name: String
    let text: String
    let folderId: UUID?

    func validate() throws {
        let trimmedName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedName.isEmpty else {
            throw Abort(.badRequest, reason: "Name is required")
        }

        let trimmedText = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedText.isEmpty else {
            throw Abort(.badRequest, reason: "Text is required")
        }
    }
}

struct UpdateDeckRequest: Content {
    let name: String?
    let text: String?
    let folderId: NullableUUIDField?
    let regenerateRaw: Bool?
    let batchSizeRaw: Int?

    enum CodingKeys: String, CodingKey {
        case name
        case text
        case folderId
        case regenerateRaw = "regenerate"
        case batchSizeRaw = "batchSize"
    }

    var shouldRegenerate: Bool { regenerateRaw ?? false }

    var batchSize: Int {
        let size = batchSizeRaw ?? 100
        return max(25, min(250, size))
    }

    func validate() throws {
        if let name = name, name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw Abort(.badRequest, reason: "Name cannot be empty")
        }

        if let text = text, text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            throw Abort(.badRequest, reason: "Text cannot be empty")
        }

        if let batchSize = batchSizeRaw, (batchSize < 25 || batchSize > 250) {
            throw Abort(.badRequest, reason: "batchSize must be between 25 and 250")
        }
    }
}

enum NullableUUIDField: Decodable {
    case value(UUID)
    case null

    var value: UUID? {
        switch self {
        case .value(let id):
            return id
        case .null:
            return nil
        }
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() {
            self = .null
        } else {
            let value = try container.decode(UUID.self)
            self = .value(value)
        }
    }
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
