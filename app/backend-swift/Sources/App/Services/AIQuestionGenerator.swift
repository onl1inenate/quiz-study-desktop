import Foundation
import Vapor

enum DeckQuestionType: String, Codable, CaseIterable {
    case mcq = "MCQ"
    case cloze = "CLOZE"
    case short = "SHORT"
}

struct AIGeneratedQuestion: Codable {
    enum CodingKeys: String, CodingKey {
        case type
        case prompt
        case options
        case correctAnswer = "correct_answer"
        case explanation
        case learningContent = "learning_content"
        case tags
        case difficulty
    }

    let type: DeckQuestionType
    let prompt: String
    let options: [String: String]?
    let correctAnswer: String
    let explanation: String
    let learningContent: String
    var tags: [String]
    let difficulty: Int

    init(type: DeckQuestionType,
         prompt: String,
         options: [String: String]?,
         correctAnswer: String,
         explanation: String,
         learningContent: String,
         tags: [String],
         difficulty: Int) {
        self.type = type
        self.prompt = prompt
        self.options = options
        self.correctAnswer = correctAnswer
        self.explanation = explanation
        self.learningContent = learningContent
        self.tags = tags
        self.difficulty = difficulty
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        type = try container.decode(DeckQuestionType.self, forKey: .type)
        prompt = try container.decode(String.self, forKey: .prompt)
        options = try container.decodeIfPresent([String: String].self, forKey: .options)
        correctAnswer = try container.decode(String.self, forKey: .correctAnswer)
        explanation = try container.decode(String.self, forKey: .explanation)
        learningContent = try container.decode(String.self, forKey: .learningContent)
        let decodedTags = try container.decodeIfPresent([String].self, forKey: .tags) ?? []
        tags = decodedTags
        difficulty = try container.decode(Int.self, forKey: .difficulty)
    }
}

private struct QuestionsEnvelope: Decodable {
    let questions: [AIGeneratedQuestion]
}

enum AIQuestionGeneratorError: Error, LocalizedError {
    case missingAPIKey
    case invalidResponse(status: HTTPStatus, body: String)
    case emptyContent
    case decodingFailed

    var errorDescription: String? {
        switch self {
        case .missingAPIKey:
            return "OPENAI_API_KEY is not set"
        case .invalidResponse(let status, let body):
            return "OpenAI returned status \(status.code): \(body)"
        case .emptyContent:
            return "OpenAI response did not include content"
        case .decodingFailed:
            return "Failed to decode AI response"
        }
    }
}

enum AIQuestionGenerator {
    static func generateBatch(text: String, batchSize: Int, on req: Request) async throws -> [AIGeneratedQuestion] {
        let sections = splitIntoSections(text)
        guard !sections.isEmpty else { return [] }

        let perSection = max(1, Int(ceil(Double(batchSize) / Double(sections.count))))
        var results: [AIGeneratedQuestion] = []
        results.reserveCapacity(batchSize)

        for (index, section) in sections.enumerated() {
            do {
                let prompt = buildPrompt(batchTarget: perSection, sourceText: section.content)
                let content = try await callStructuredJSON(prompt: prompt, on: req)
                let questions = try parseQuestions(content)
                for var question in questions {
                    var tags = question.tags
                    tags.append("section:\(section.id)")
                    var seen: Set<String> = []
                    question.tags = tags.filter { tag in
                        let (inserted, _) = seen.insert(tag)
                        return inserted
                    }
                    results.append(question)
                    if results.count >= batchSize { break }
                }
                if results.count >= batchSize { break }
            } catch {
                req.logger.error("AI generation failed for section \(index + 1): \(error.localizedDescription)")
                throw error
            }
        }

        return Array(results.prefix(batchSize))
    }

    private static func buildPrompt(batchTarget: Int, sourceText: String) -> String {
        """
        Generate high-quality study questions from the following text.

        Distribution across the batch:
        - 50% MCQ (4 options a/b/c/d; spread correct answers across different letters; avoid trivial answers; use realistic near-miss distractors that mirror common misconceptions; include a concise rationale for why each option is right or wrong)
        - 25% Cloze (single blank '_____')
        - 25% Short Answer

        For EVERY question include these exact fields:
        - type ("MCQ" | "CLOZE" | "SHORT")
        - prompt (string)
        - options (object with keys a,b,c,d). For CLOZE/SHORT still include options but set a,b,c,d to "".
        - correct_answer (string)
        - explanation (string; Explain why each option (a–d) is correct or incorrect.)
        - learning_content (string; 2–4 sentence study note including concepts or facts needed to answer the question. State neutrally and avoid revealing the answer.)
        - tags (array of topical strings)
        - difficulty (integer 1–5)

        Ground everything strictly in the source. Avoid duplicates; vary difficulty and tags.
        - Use diverse question stems.
        - Include scenario/application prompts.
        - Mix straightforward recall with deeper analysis questions.
        Write \(batchTarget) total.

        SOURCE:
        \(sourceText)
        """
    }

    private static func splitIntoSections(_ text: String) -> [Section] {
        let normalized = text.replacingOccurrences(of: "\r\n", with: "\n").replacingOccurrences(of: "\r", with: "\n")
        let lines = normalized.split(omittingEmptySubsequences: false, whereSeparator: { $0 == "\n" })
        var sections: [Section] = []
        var current: Section?
        var count = 0

        for rawLine in lines {
            let line = String(rawLine)
            if line.range(of: "^#+\\s+", options: .regularExpression) != nil {
                if let currentSection = current {
                    sections.append(currentSection)
                }
                count += 1
                current = Section(id: "\(count)", content: "")
                continue
            }

            if current == nil {
                current = Section(id: "1", content: "")
                count = 1
            }

            current?.content.append(line)
            current?.content.append("\n")
        }

        if let currentSection = current {
            sections.append(currentSection)
        }

        if sections.isEmpty {
            return [Section(id: "1", content: text)]
        }

        return sections
    }

    private static func parseQuestions(_ json: String) throws -> [AIGeneratedQuestion] {
        let trimmed = json.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw AIQuestionGeneratorError.emptyContent }
        guard let data = trimmed.data(using: .utf8) else { throw AIQuestionGeneratorError.decodingFailed }

        do {
            let decoder = JSONDecoder()
            let envelope = try decoder.decode(QuestionsEnvelope.self, from: data)
            return envelope.questions
        } catch {
            throw AIQuestionGeneratorError.decodingFailed
        }
    }

    private static func callStructuredJSON(prompt: String, on req: Request) async throws -> String {
        do {
            return try await callChatCompletions(prompt: prompt, on: req)
        } catch AIQuestionGeneratorError.decodingFailed {
            throw error
        } catch {
            throw error
        }
    }

    private static func callChatCompletions(prompt: String, on req: Request) async throws -> String {
        guard let apiKey = Environment.get("OPENAI_API_KEY"), !apiKey.isEmpty else {
            throw AIQuestionGeneratorError.missingAPIKey
        }

        let model = Environment.get("OPENAI_MODEL") ?? "gpt-4o-mini"
        let maxRetries = Environment.get("OPENAI_MAX_RETRIES").flatMap(Int.init) ?? 2

        let body = ChatCompletionsRequest(
            model: model,
            messages: [ChatCompletionsRequest.Message(role: "user", content: prompt)],
            responseFormat: .init(type: "json_object"),
            temperature: 0.7
        )

        var lastError: Error?
        for attempt in 0...maxRetries {
            do {
                let response = try await req.client.post(URI(string: "https://api.openai.com/v1/chat/completions")) { request in
                    request.headers.add(name: .authorization, value: "Bearer \(apiKey)")
                    request.headers.add(name: .contentType, value: "application/json")
                    try request.content.encode(body)
                }

                guard response.status == .ok else {
                    let bodyString = response.body.flatMap { String(buffer: $0) } ?? ""
                    throw AIQuestionGeneratorError.invalidResponse(status: response.status, body: bodyString)
                }

                guard let responseBody = response.body else {
                    throw AIQuestionGeneratorError.emptyContent
                }

                let responseString = String(buffer: responseBody)
                guard let data = responseString.data(using: .utf8) else {
                    throw AIQuestionGeneratorError.emptyContent
                }

                let decoder = JSONDecoder()
                let payload = try decoder.decode(ChatCompletionsResponse.self, from: data)
                if let content = payload.choices.first?.message.content, !content.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    return content
                }

                throw AIQuestionGeneratorError.emptyContent
            } catch {
                lastError = error
                if attempt < maxRetries {
                    let delay = UInt64(500_000_000 * (attempt + 1))
                    try await Task.sleep(nanoseconds: delay)
                }
            }
        }

        throw lastError ?? AIQuestionGeneratorError.emptyContent
    }
}

private struct Section {
    let id: String
    var content: String
}

private struct ChatCompletionsRequest: Encodable {
    struct Message: Encodable {
        let role: String
        let content: String
    }

    struct ResponseFormat: Encodable {
        let type: String

        enum CodingKeys: String, CodingKey {
            case type
        }
    }

    let model: String
    let messages: [Message]
    let responseFormat: ResponseFormat
    let temperature: Double

    enum CodingKeys: String, CodingKey {
        case model
        case messages
        case responseFormat = "response_format"
        case temperature
    }
}

private struct ChatCompletionsResponse: Decodable {
    struct Choice: Decodable {
        struct Message: Decodable {
            let content: String?
        }
        let message: Message
    }

    let choices: [Choice]
}
