import { PrismaClient as HaulingPrismaClient } from '../../node_modules/.prisma/hauling-client';

const haulingDB: HaulingPrismaClient = new HaulingPrismaClient();

export default haulingDB;
