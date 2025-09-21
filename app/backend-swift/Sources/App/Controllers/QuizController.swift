import Vapor

final class QuizController {
    func boot(routes: RoutesBuilder) throws {
        routes.post("session", use: session)
        routes.post("submit", use: submit)
    }

    func session(req: Request) async throws -> QuizSessionResponse {
        throw Abort(.notImplemented)
    }

    func submit(req: Request) async throws -> QuizSubmitResponse {
        throw Abort(.notImplemented)
    }
}

struct QuizSessionResponse: Content {
    let questions: [QuizQuestion]
}

struct QuizQuestion: Content {
    enum CodingKeys: String, CodingKey {
        case id
        case deckId
        case type
        case prompt
        case learningContent = "learning_content"
        case options
        case answerMap
        case correctCount
        case mastered
    }

    let id: UUID
    let deckId: UUID
    let type: QuizQuestionType
    let prompt: String
    let learningContent: String?
    let options: [String: String]?
    let answerMap: [String: String]?
    let correctCount: Int
    let mastered: Bool
}

enum QuizQuestionType: String, Content {
    case mcq = "MCQ"
    case cloze = "CLOZE"
    case short = "SHORT"
}

struct QuizSubmitResponse: Content {
    enum CodingKeys: String, CodingKey {
        case isCorrect
        case correctAnswer = "correct_answer"
        case userAnswer = "user_answer"
        case explanation
        case correctCount
        case completed
        case mastered
    }

    let isCorrect: Bool
    let correctAnswer: String
    let userAnswer: String
    let explanation: String
    let correctCount: Int
    let completed: Bool
    let mastered: Bool
}
