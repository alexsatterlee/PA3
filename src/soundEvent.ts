import { RowDataPacket } from 'mysql2';

export interface SoundEvent extends RowDataPacket {
    id: number;
    level: number;
    recorded_at: Date;
}
