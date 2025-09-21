import Fluent
import Foundation
import SQLKit
import Vapor

struct InsertQuestion {
    var id: UUID?
    var deckId: UUID
    var type: String
    var prompt: String
    var options: [String: String]?
    var correctAnswer: String?
    var explanation: String?
    var learningContent: String?
    var tags: [String]?
    var difficulty: Int?
}

enum DatabaseService {
    static func insertQuestion(_ question: InsertQuestion, on database: Database) -> EventLoopFuture<UUID> {
        let identifier = question.id ?? UUID()
        let optionsJSON: String?
        do {
            optionsJSON = try question.options.map { options in
                let data = try JSONEncoder().encode(options)
                guard let json = String(data: data, encoding: .utf8) else {
                    throw EncodingError.invalidValue(options, EncodingError.Context(
                        codingPath: [],
                        debugDescription: "Unable to encode options to UTF-8 string"
                    ))
                }
                return json
            }
        } catch {
            return database.eventLoop.makeFailedFuture(error)
        }

        let tags = question.tags?.joined(separator: ",")
        let difficulty = question.difficulty ?? 3

        let sql: SQLQueryString = """
            INSERT INTO "Questions" (id, deckId, type, prompt, options, correct_answer, explanation, learning_content, tags, difficulty)
            VALUES (\(bind: identifier.uuidString), \(bind: question.deckId.uuidString), \(bind: question.type), \(bind: question.prompt), \(bind: optionsJSON), \(bind: question.correctAnswer), \(bind: question.explanation), \(bind: question.learningContent), \(bind: tags), \(bind: difficulty))
        """

        return database.sql().raw(sql).run().transform(to: identifier)
    }
}

extension Request {
    func insertQuestionFuture(_ question: InsertQuestion) -> EventLoopFuture<UUID> {
        DatabaseService.insertQuestion(question, on: db)
    }

    func insertQuestion(_ question: InsertQuestion) async throws -> UUID {
        try await DatabaseService.insertQuestion(question, on: db).get()
    }
}
