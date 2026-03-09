import './config/env';
import app from './app';
import { env } from './config/env';
import { smsScheduler } from './services/smsScheduler.service';

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Environment: ${env.NODE_ENV}`);

  // Start the SMS reminder scheduler
  smsScheduler.start();
});
