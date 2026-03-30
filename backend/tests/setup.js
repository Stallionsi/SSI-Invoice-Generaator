const mongoose = require('mongoose');

// Mock Redis + BullMQ before any service file imports them
jest.mock('../src/config/redis', () => ({
  getRedisClient: () => ({
    get:    jest.fn().mockResolvedValue(null),
    set:    jest.fn().mockResolvedValue('OK'),
    setex:  jest.fn().mockResolvedValue('OK'),
    del:    jest.fn().mockResolvedValue(1),
    on:     jest.fn(),
    quit:   jest.fn().mockResolvedValue('OK'),
  }),
  getRedisConnection: () => ({
    on:   jest.fn(),
    quit: jest.fn().mockResolvedValue('OK'),
  }),
}));

jest.mock('../src/config/queue', () => ({
  addEmailJob:    jest.fn().mockResolvedValue({}),
  addPdfJob:      jest.fn().mockResolvedValue({}),
  scheduleReminder: jest.fn().mockResolvedValue({}),
  addWebhookJob:  jest.fn().mockResolvedValue({}),
  emailQueue:     { add: jest.fn().mockResolvedValue({}) },
  pdfQueue:       { add: jest.fn().mockResolvedValue({}) },
  reminderQueue:  { add: jest.fn().mockResolvedValue({}) },
  webhookQueue:   { add: jest.fn().mockResolvedValue({}) },
}));

jest.mock('../src/services/email.service', () => ({
  sendEmail:             jest.fn().mockResolvedValue({}),
  sendInvoiceEmail:      jest.fn().mockResolvedValue({}),
  sendPaymentReminder:   jest.fn().mockResolvedValue({}),
  sendPaymentReceipt:    jest.fn().mockResolvedValue({}),
  sendPasswordResetEmail: jest.fn().mockResolvedValue({}),
}));

jest.mock('../src/services/storage.service', () => ({
  uploadFile:   jest.fn().mockResolvedValue({ url: 'https://ik.imagekit.io/test/file.pdf', fileId: 'test_file_id', fileName: 'test.pdf', fileSize: 1024 }),
  uploadBuffer: jest.fn().mockResolvedValue({ url: 'https://ik.imagekit.io/test/file.pdf', fileId: 'test_file_id', fileName: 'test.pdf' }),
  deleteFile:   jest.fn().mockResolvedValue({}),
}));

beforeAll(async () => {
  await mongoose.connect(process.env.MONGO_URI);
});

afterAll(async () => {
  await mongoose.disconnect();
});

afterEach(async () => {
  // Clear all documents between tests for isolation
  const collections = mongoose.connection.collections;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  jest.clearAllMocks();
});
