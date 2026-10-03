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

        console.log("Handler of the job called");
        console.log("Submission payload:", this.payload);

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
            code,
            language,
            inputCase,
            outputCase,
            userId,
            submissionId
        } = submissionPayload;

        const strategy = createExecutor(language);

        if (!strategy) {
            throw new Error(
                `Unsupported language: ${language}`
            );
        }

        console.log(
            `Executing submission ${submissionId} in ${language}`
        );

        const response: ExecutionResponse =
            await strategy.execute(
                code,
                inputCase,
                outputCase
            );

        const evaluationPayload: EvaluationPayload = {
            submissionId: String(submissionId),
            userId,
            status: mapExecutionStatus(response.status),
            actualOutput: normalizeOutput(response.output),
            expectedOutput: normalizeOutput(outputCase),
            language
        };

        if (
            response.status === "RE" ||
            response.status === "TLE"
        ) {
            evaluationPayload.error = response.output;
        }

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