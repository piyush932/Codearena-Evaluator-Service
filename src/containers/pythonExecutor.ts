import Docker from "dockerode";

import CodeExecutorStrategy, {
    ExecutionResponse
} from "../types/CodeExecutorStrategy";
import { PYTHON_IMAGE } from "../utils/constants";
import createContainer from "./containerFactory";
import decodeDockerStream from "./dockerHelper";
import pullImage from "./pullImage";

function normalizeOutput(value: string = ""): string {
    return value
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim();
}

function escapeSingleQuotedShellValue(value: string): string {
    return value.replace(/'/g, "'\\''");
}

class PythonExecutor implements CodeExecutorStrategy {
    async execute(
        code: string,
        inputTestCase: string,
        outputTestCase: string
    ): Promise<ExecutionResponse> {
        const rawLogBuffer: Buffer[] = [];

        await pullImage(PYTHON_IMAGE);

        const escapedCode =
            escapeSingleQuotedShellValue(code);

        const escapedInput =
            escapeSingleQuotedShellValue(inputTestCase);

        const runCommand =
            `printf '%s' '${escapedCode}' > test.py && ` +
            `printf '%s' '${escapedInput}' | python3 test.py`;

        const pythonDockerContainer =
            await createContainer(
                PYTHON_IMAGE,
                [
                    "/bin/sh",
                    "-c",
                    runCommand
                ]
            );

        try {
            await pythonDockerContainer.start();

            const loggerStream =
                await pythonDockerContainer.logs({
                    stdout: true,
                    stderr: true,
                    timestamps: false,
                    follow: true
                });

            loggerStream.on(
                "data",
                (chunk: Buffer) => {
                    rawLogBuffer.push(chunk);
                }
            );

            const codeResponse =
                await this.fetchDecodedStream(
                    loggerStream,
                    rawLogBuffer,
                    pythonDockerContainer
                );

            const actualOutput =
                normalizeOutput(codeResponse);

            const expectedOutput =
                normalizeOutput(outputTestCase);

            return {
                output: codeResponse,
                status:
                    actualOutput === expectedOutput
                        ? "SUCCESS"
                        : "WA"
            };
        } catch (error) {
            const errorText = String(error);

            console.error(
                "Python execution error:",
                errorText
            );

            return {
                output: errorText,
                status:
                    errorText === "TLE"
                        ? "TLE"
                        : "RE"
            };
        } finally {
            try {
                await pythonDockerContainer.remove({
                    force: true
                });
            } catch (cleanupError) {
                console.error(
                    "Python container cleanup failed:",
                    cleanupError
                );
            }
        }
    }

    private fetchDecodedStream(
        loggerStream: NodeJS.ReadableStream,
        rawLogBuffer: Buffer[],
        container: Docker.Container
    ): Promise<string> {
        return new Promise((resolve, reject) => {
            let settled = false;

            const timeout = setTimeout(async () => {
                if (settled) {
                    return;
                }

                settled = true;

                console.log("Python execution timed out");

                try {
                    await container.kill();
                } catch {
                    // The process may have already exited.
                }

                reject("TLE");
            }, 2000);

            const finishWithError = async (
                error: unknown
            ) => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);

                try {
                    await container.kill();
                } catch {
                    // Container may already be stopped.
                }

                reject(error);
            };

            loggerStream.on("end", () => {
                if (settled) {
                    return;
                }

                settled = true;
                clearTimeout(timeout);

                const completeBuffer =
                    Buffer.concat(rawLogBuffer);

                const decodedStream =
                    decodeDockerStream(completeBuffer);

                if (decodedStream.stderr.trim()) {
                    reject(decodedStream.stderr);
                    return;
                }

                resolve(decodedStream.stdout);
            });

            loggerStream.on("error", (error) => {
                void finishWithError(error);
            });
        });
    }
}

export default PythonExecutor;