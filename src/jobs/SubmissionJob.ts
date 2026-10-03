import { Job } from "bullmq";

import evaluationQueue from "../queues/evaluationQueue";
import { IJob } from "../types/bullMqJobDefinition";
import { ExecutionResponse } from "../types/CodeExecutorStrategy";
import {
    EvaluationPayload,
    EvaluationStatus
} from "../types/evaluationPayload";
import { SubmissionPayload } from "../types/submissionPayload";
import createExecutor from "../utils/ExecutorFactory";

function mapExecutionStatus(
    executionStatus: ExecutionResponse["status"]
): EvaluationStatus {
    switch (executionStatus) {
        case "SUCCESS":
            return "Success";

        case "WA":
            return "WA";

        case "TLE":
            return "TLE";

        case "RE":
        default:
            return "RE";
    }
}

function normalizeOutput(value: string = ""): string {
    return value
        .replace(/\r\n/g, "\n")
        .replace(/\r/g, "\n")
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n")
        .trim();
}

export default class SubmissionJob implements IJob {
    name: string;
    payload: Record<string, SubmissionPayload>;

    constructor(payload: Record<string, SubmissionPayload>) {
        this.payload = payload;
        this.name = this.constructor.name;
    }

    handle = async (job?: Job) => {
        if (!job) {
            throw new Error("BullMQ job was not provided");
        }

        const payloadKeys = Object.keys(this.payload);

        if (payloadKeys.length !== 1) {
            throw new Error(
                "Expected exactly one submission payload per job"
            );
        }

        const payloadKey = payloadKeys[0];
        const submissionPayload = this.payload[payloadKey];

        if (!submissionPayload) {
            throw new Error("Submission payload was not found");
        }

        const {
            submissionId,
            userId,
            code,
            language,
            testCases
        } = submissionPayload;

        if (
            !Array.isArray(testCases) ||
            testCases.length === 0
        ) {
            throw new Error(
                "Submission payload does not contain test cases"
            );
        }

        const strategy = createExecutor(language);

        if (!strategy) {
            throw new Error(
                `Unsupported language: ${language}`
            );
        }

        console.log(
            `Executing ${testCases.length} test cases for submission ${submissionId}`
        );

        let passedTestCases = 0;
        let failedTestCaseIndex: number | null = null;
        let finalStatus: EvaluationStatus = "Success";

        let actualOutput = "";
        let expectedOutput = "";
        let executionError: string | undefined;

        for (
            let index = 0;
            index < testCases.length;
            index++
        ) {
            const testCase = testCases[index];

            console.log(
                `Running testcase ${index + 1}/${testCases.length}`
            );

            const response: ExecutionResponse =
                await strategy.execute(
                    code,
                    testCase.inputCase,
                    testCase.outputCase
                );

            actualOutput = normalizeOutput(response.output);
            expectedOutput = normalizeOutput(
                testCase.outputCase
            );

            if (response.status === "SUCCESS") {
                passedTestCases++;

                console.log(
                    `Testcase ${index + 1} passed`
                );

                continue;
            }

            failedTestCaseIndex = index;
            finalStatus = mapExecutionStatus(response.status);

            if (
                response.status === "RE" ||
                response.status === "TLE"
            ) {
                executionError = response.output;
            }

            console.log(
                `Testcase ${index + 1} failed with ${finalStatus}`
            );

            break;
        }

        const evaluationPayload: EvaluationPayload = {
            submissionId: String(submissionId),
            userId,
            status: finalStatus,
            actualOutput,
            expectedOutput,
            language,
            passedTestCases,
            totalTestCases: testCases.length,
            failedTestCaseIndex,
            error: executionError
        };

        const evaluationJob = await evaluationQueue.add(
            "EvaluationJob",
            evaluationPayload,
            {
                removeOnComplete: false,
                removeOnFail: false
            }
        );

        console.log(
            "Evaluation job created:",
            evaluationJob.id
        );

        console.log(
            "Evaluation payload:",
            evaluationPayload
        );

        return evaluationPayload;
    };

    failed = (job?: Job): void => {
        console.error(
            "Submission job failed:",
            job?.id
        );
    };
}