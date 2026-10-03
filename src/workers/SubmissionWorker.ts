import { Job, Worker } from "bullmq";

import redisConnection from "../config/redisConfig";
import SubmissionJob from "../jobs/SubmissionJob";

export default function SubmissionWorker(queueName: string) {
    const worker = new Worker(
        queueName,
        async (job: Job) => {
            if (job.name !== "SubmissionJob") {
                console.warn(
                    `Ignoring unknown job name: ${job.name}`
                );

                return;
            }

            try {
                const submissionJobInstance =
                    new SubmissionJob(job.data);

                console.log(
                    "Calling SubmissionJob handler for job:",
                    job.id
                );

                const result =
                    await submissionJobInstance.handle(job);

                console.log(
                    "SubmissionJob completed:",
                    job.id,
                    result
                );

                return result;
            } catch (error) {
                console.error(
                    "SubmissionJob failed:",
                    job.id
                );

                console.error(error);

                throw error;
            }
        },
        {
            connection: redisConnection,
            concurrency: 1
        }
    );

    worker.on("completed", (job, result) => {
        console.log(
            "SubmissionQueue job completed:",
            job.id,
            result
        );
    });

    worker.on("failed", (job, error) => {
        console.error(
            "SubmissionQueue job failed:",
            job?.id,
            error.message
        );
    });

    worker.on("error", (error) => {
        console.error(
            "SubmissionQueue worker error:",
            error
        );
    });

    return worker;
}