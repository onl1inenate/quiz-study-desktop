import Vapor
import Fluent
import FluentSQLiteDriver

public func configure(_ app: Application) throws {
    if app.environment == .development {
        app.logger.logLevel = .debug
    }

    // SQLite configuration mirrors the existing Node backend which uses data.sqlite in-place.
    app.databases.use(.sqlite(.file("data.sqlite")), as: .sqlite)

    // JSON payload size limit matches the Express configuration (default 10 MB).
    let limitBytes = Environment.get("JSON_LIMIT").flatMap(Int.init) ?? 10 * 1024 * 1024
    app.routes.defaultMaxBodySize = ByteCount(limitBytes)

    // Align CORS behavior with Express' permissive configuration so the desktop shell can call it.
    let corsConfiguration = CORSMiddleware.Configuration(
        allowedOrigin: .any,
        allowedMethods: [.GET, .POST, .PUT, .PATCH, .DELETE, .OPTIONS],
        allowedHeaders: [.accept, .authorization, .contentType, .origin, .xRequestedWith]
    )
    app.middleware.use(CORSMiddleware(configuration: corsConfiguration))
    app.middleware.use(ErrorMiddleware.default(environment: app.environment))

    DatabaseMigrator.configure(app)
    try app.autoMigrate().wait()

    try routes(app)
}
