// swift-tools-version: 6.1
import PackageDescription

let package = Package(
    name: "PojAPI",
    platforms: [.iOS(.v18), .macOS(.v15)],
    products: [
        .library(name: "PojAPI", targets: ["PojAPI"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-openapi-generator", from: "1.13.0"),
        .package(url: "https://github.com/apple/swift-openapi-runtime", from: "1.12.0"),
        .package(url: "https://github.com/apple/swift-openapi-urlsession", from: "1.3.0"),
        .package(url: "https://github.com/apple/swift-http-types", from: "1.4.0"),
        // Dépendance transitive (swift-openapi-urlsession) plafonnée : compilée avec Swift 6.4,
        // la 1.7.0 référence `swift_initBorrow`, absent des runtimes iOS/macOS 26 → crash au lancement.
        .package(url: "https://github.com/apple/swift-collections", "1.1.0"..<"1.7.0"),
    ],
    targets: [
        .target(
            name: "PojAPI",
            dependencies: [
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
                .product(name: "OpenAPIURLSession", package: "swift-openapi-urlsession"),
                .product(name: "HTTPTypes", package: "swift-http-types"),
            ],
            plugins: [.plugin(name: "OpenAPIGenerator", package: "swift-openapi-generator")]
        ),
        .testTarget(
            name: "PojAPITests",
            dependencies: [
                "PojAPI",
                .product(name: "HTTPTypes", package: "swift-http-types"),
                .product(name: "OpenAPIRuntime", package: "swift-openapi-runtime"),
            ]
        ),
    ]
)
