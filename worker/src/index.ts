import { NativeConnection, Worker } from '@temporalio/worker';
import * as convertActivities from './activities/convertImage';
import * as persistActivities from './activities/persistToMinio';

const TEMPORAL_ADDRESS = process.env.TEMPORAL_ADDRESS ||
  'temporal-frontend.temporal.svc.cluster.local:7233';
const TASK_QUEUE = 'image-processing';

async function run() {
  console.log('Starting Temporal worker...');
  console.log(`Temporal: ${TEMPORAL_ADDRESS}`);
  console.log(`Task queue: ${TASK_QUEUE}`);

  // Connect to Temporal
  const connection = await NativeConnection.connect({
    address: TEMPORAL_ADDRESS,
  });

  console.log('✓ Connected to Temporal');

  // Create worker
  const worker = await Worker.create({
    connection,
    namespace: 'default',
    taskQueue: TASK_QUEUE,
    workflowsPath: require.resolve('./workflows/image-batch-workflow'),
    activities: {
      ...convertActivities,
      ...persistActivities,
    },
  });

  console.log('✓ Worker ready');
  console.log('🚀 Listening for tasks...');

  await worker.run();
}

run().catch((err) => {
  console.error('Worker failed:', err);
  process.exit(1);
});