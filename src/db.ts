import mysql, { Pool } from 'mysql2/promise'
import "dotenv/config";
import {SoundEvent} from "./soundEvent";

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const pool: Pool = mysql.createPool({
    host: requireEnv("DB_HOST"),
    user: requireEnv("DB_USER"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_NAME"),
    port: Number(process.env.DB_PORT) || 3306,

    waitForConnections: true,
    connectionLimit: 10,
    maxIdle: 10,
    idleTimeout: 60000,
    queueLimit: 0
});

export default pool;

export async function insertSoundEvent(level: number): Promise<void> {
    await pool.execute('INSERT INTO sound_events (level) VALUES (?)', [level]);
}

export async function getSoundEvents(): Promise<SoundEvent[]> {
    const [rows] = await pool.query<SoundEvent[]>(
        'SELECT id, level, recorded_at FROM sound_events ORDER BY recorded_at DESC LIMIT 100');
    return rows;
}