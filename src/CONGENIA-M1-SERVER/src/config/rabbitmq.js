'use strict';

const amqplib = require('amqplib');

function buildAmqpUrl() {
  const host = process.env.RABBITMQ_HOST || 'localhost';
  const port = process.env.RABBITMQ_PORT || '5672';
  const user = encodeURIComponent(process.env.RABBITMQ_USER || process.env.RABBITMQ_DEFAULT_USER || 'congenia');
  const pass = encodeURIComponent(process.env.RABBITMQ_PASSWORD || process.env.RABBITMQ_DEFAULT_PASS || '');
  const vhost = encodeURIComponent(process.env.RABBITMQ_VHOST || process.env.RABBITMQ_DEFAULT_VHOST || '/');
  return `amqp://${user}:${pass}@${host}:${port}/${vhost}`;
}

/**
 * Publica y espera la confirmacion del broker (publisher confirms). Sin ella,
 * sendToQueue solo deja el mensaje en el buffer del socket: la bandeja de
 * salida marcaria como publicado un mensaje que el broker nunca acepto.
 */
async function publishToQueue(queue, message) {
  const connection = await amqplib.connect(buildAmqpUrl());
  try {
    const channel = await connection.createConfirmChannel();
    await channel.assertQueue(queue, { durable: true });
    channel.sendToQueue(queue, Buffer.from(JSON.stringify(message)), {
      persistent: true,
      contentType: 'application/json',
    });
    await channel.waitForConfirms();
    await channel.close();
  } finally {
    await connection.close();
  }
}

module.exports = { publishToQueue };
