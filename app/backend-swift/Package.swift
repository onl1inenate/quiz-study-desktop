// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "QuizStudyServer",
    platforms: [
        .macOS(.v13)
    ],
    products: [
        .executable(name: "Run", targets: ["Run"])
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.88.0"),
        .package(url: "https://github.com/vapor/fluent-sqlite-driver.git", from: "4.5.0")
    ],
    targets: [
        .target(
            name: "App",
            dependencies: [
                .product(name: "Vapor", package: "vapor"),
                .product(name: "FluentSQLiteDriver", package: "fluent-sqlite-driver")
            ],
            swiftSettings: [
                .unsafeFlags(["-warnings-as-errors"], .when(configuration: .release))
            ]
        ),
        .executableTarget(
            name: "Run",
            dependencies: ["App"]
        )
    ]
)
