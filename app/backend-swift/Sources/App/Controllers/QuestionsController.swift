import Vapor

final class QuestionsController {
    func boot(routes: RoutesBuilder) throws {
        routes.get(":id", use: show)
    }

    func show(req: Request) async throws -> QuestionDetail {
        throw Abort(.notImplemented)
    }
}

struct QuestionDetail: Content {
    enum CodingKeys: String, CodingKey {
        case id
        case deckId
        case type
        case prompt
        case options
        case correctAnswer = "correct_answer"
        case explanation
        case learningContent = "learning_content"
        case tags
        case difficulty
    }

    let id: String
    let deckId: String
    let type: String
    let prompt: String
    let options: String?
    let correctAnswer: String?
    let explanation: String?
    let learningContent: String?
    let tags: String?
    let difficulty: Int?
}
