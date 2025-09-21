import Vapor

public func routes(_ app: Application) throws {
    app.get("health") { _ in
        HealthResponse(ok: true)
    }

    let decks = app.grouped("decks")
    let quiz = app.grouped("quiz")
    let questions = app.grouped("questions")
    let folders = app.grouped("folders")

    try DecksController().boot(routes: decks)
    try QuizController().boot(routes: quiz)
    try QuestionsController().boot(routes: questions)
    try FoldersController().boot(routes: folders)
}

struct HealthResponse: Content {
    let ok: Bool
}
