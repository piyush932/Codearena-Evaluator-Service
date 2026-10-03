import Docker from "dockerode";

import CodeExecutorStrategy, {
    ExecutionResponse
} from "../types/CodeExecutorStrategy";
import { JAVA_IMAGE } from "../utils/constants";
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

class JavaExecutor implements CodeExecutorStrategy {
    async execute(
        code: string,
        inputTestCase: string,
        outputTestCase: string
    ): Promise<ExecutionResponse> {
        const rawLogBuffer: Buffer[] = [];

        await pullImage(JAVA_IMAGE);

        const escapedCode =
            escapeSingleQuotedShellValue(code);

        const escapedInput =
            escapeSingleQuotedShellValue(inputTestCase);

        const runCommand =
            `printf '%s' '${escapedCode}' > Main.java && ` +
            `javac Main.java && ` +
            `printf '%s' '${escapedInput}' | java Main`;

        console.log(
            "Initializing Java execution container"
        );

        const javaDockerContainer = await createContainer(
            JAVA_IMAGE,
            [
                "/bin/sh",
                "-c",
                runCommand
            ]
        );

        try {
            await javaDockerContainer.start();

            console.log(
                "Started Java execution container"
            );

            const loggerStream =
                await javaDockerContainer.logs({
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
                    javaDockerContainer
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
                "Java execution failed:",
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
                await javaDockerContainer.remove({
                    force: true
                });
            } catch (cleanupError) {
                console.error(
                    "Java container cleanup failed:",
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
            const timeout = setTimeout(async () => {
                console.log("Java execution timeout");

                try {
                    await container.kill();
                } catch {
                    // Container may have exited naturally.
                }

                reject("TLE");
            }, 2000);

            loggerStream.on("end", () => {
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
                clearTimeout(timeout);
                reject(error);
            });
        });
    }
}

export default JavaExecutor;