import App
import Vapor

#if os(Linux)
import Glibc
#else
import Darwin
#endif

var env = try Environment.detect()
try LoggingSystem.bootstrap(from: &env)
let app = Application(env)
defer { app.shutdown() }

try configure(app)

taskNotifyReady()

try app.run()

private func taskNotifyReady() {
    Task.detached {
        guard let pipe = Environment.get("BACKEND_READY_PIPE") else { return }
        pipe.withCString { cString in
            let fd = open(cString, O_WRONLY | O_CLOEXEC)
            guard fd >= 0 else { return }
            defer { close(fd) }
            let message = "ready\n"
            message.withCString { ptr in
                _ = write(fd, ptr, message.count)
            }
        }
    }
}
