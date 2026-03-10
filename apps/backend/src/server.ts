import './config/env';
import app from './app';
import { env } from './config/env';
import { smsScheduler } from './services/smsScheduler.service';
import fs from 'fs';
import path from 'path';

// Ensure upload directories exist
const uploadDirs = [
  path.join(__dirname, '..', 'uploads', 'photos'),
  path.join(__dirname, '..', 'uploads', 'signatures'),
  path.join(__dirname, '..', 'uploads', 'delivery-notes'),
  path.join(__dirname, '..', 'uploads', 'delivery-notes', 'signed'),
];
uploadDirs.forEach((dir) => fs.mkdirSync(dir, { recursive: true }));

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);

  // Start the SMS reminder scheduler
  smsScheduler.start();
});
