import 'dotenv/config';
import * as joi from 'joi';

interface EnvVars {
  PORT: number;
  DATABASE_URL: string;
  // PRODUCTS_MICROSERVICE_HOST: string;
  // PRODUCTS_MICROSERVICE_PORT: number;
  NATS_SERVERS: string[];
}

const envsSchema = joi
  .object({
    PORT: joi.number().required(),
    DATABASE_URL: joi.string().required(),
    // PRODUCTS_MICROSERVICE_HOST: joi.string().required(),
    // PRODUCTS_MICROSERVICE_PORT: joi.number().required(),
    NATS_SERVERS: joi.array().items(joi.string()).required(),
  })
  .unknown(true);

const { error, value } = envsSchema.validate({
  ...process.env,
  NATS_SERVERS: process.env.NATS_SERVERS?.split(','),
});

if (error) throw new Error(`Config validation error ${error.message}`);

const envsVars: EnvVars = value;

export const envs = {
  port: envsVars.PORT,
  database_url: envsVars.DATABASE_URL,
  // PRODUCTS_MICROSERVICE_HOST: envsVars.PRODUCTS_MICROSERVICE_HOST,
  // PRODUCTS_MICROSERVICE_PORT: envsVars.PRODUCTS_MICROSERVICE_PORT,
  natsServers: envsVars.NATS_SERVERS,
};
