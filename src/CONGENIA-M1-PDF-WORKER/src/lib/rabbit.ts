import amqp from 'amqplib';
import type { Channel } from 'amqplib';

type RabbitConnection = Awaited<ReturnType<typeof amqp.connect>>;

export interface RabbitContext {
  connection: RabbitConnection;
  channel: Channel;
}

export interface QueueTopology {
  mainQueue: string;
  dlqQueue: string;
}

export async function createRabbitContext(
  url: string,
  prefetch: number,
  topology: QueueTopology
): Promise<RabbitContext> {
  const connection = await amqp.connect(url);
  const channel = await connection.createChannel();

  await channel.assertQueue(topology.mainQueue, { durable: true });
  await channel.assertQueue(topology.dlqQueue, { durable: true });
  await channel.prefetch(prefetch);

  return { connection, channel };
}

export async function closeRabbitContext(context?: RabbitContext): Promise<void> {
  if (!context) return;
  await context.channel.close();
  await context.connection.close();
}
