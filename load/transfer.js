import http from 'k6/http';
import { sleep } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000/api';
const RATE = Number(__ENV.RATE || 1000);
const ACCOUNTS = Number(__ENV.ACCOUNTS || 10000);
const DURATION_SECONDS = 60;
const WARMUP_SECONDS = Number(__ENV.WARMUP_SECONDS || 0);
const COMPLETION_TIMEOUT_SECONDS = 110;

const completionTime = new Trend('transfer_completion_time', true);
const completionTimeouts = new Counter('transfer_completion_timeouts');

const warmup = {
  executor: 'ramping-arrival-rate',
  exec: 'transfer',
  startRate: Math.min(50, RATE),
  timeUnit: '1s',
  stages: [{ target: RATE, duration: `${WARMUP_SECONDS}s` }],
  preAllocatedVUs: 200,
  maxVUs: 2000,
};

export const options = {
  scenarios: {
    ...(WARMUP_SECONDS > 0 && { warmup }),
    transfers: {
      executor: 'constant-arrival-rate',
      exec: 'transfer',
      startTime: `${WARMUP_SECONDS}s`,
      rate: RATE,
      timeUnit: '1s',
      duration: `${DURATION_SECONDS}s`,
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
    completion: {
      executor: 'constant-arrival-rate',
      exec: 'completion',
      startTime: `${WARMUP_SECONDS}s`,
      rate: 2,
      timeUnit: '1s',
      duration: `${DURATION_SECONDS}s`,
      preAllocatedVUs: 20,
      maxVUs: 500,
      gracefulStop: `${COMPLETION_TIMEOUT_SECONDS + 10}s`,
    },
  },
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
  thresholds: {
    'http_reqs{scenario:transfers}': [
      `count>=${RATE * DURATION_SECONDS * 0.99}`,
    ],
    'http_req_duration{scenario:transfers}': ['p(99)<300'],
  },
};

function accountId(i) {
  return `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
}

function randomAccount() {
  return 1 + Math.floor(Math.random() * ACCOUNTS);
}

function postTransfer() {
  const from = randomAccount();
  let to = randomAccount();
  while (to === from) to = randomAccount();

  const response = http.post(
    `${BASE_URL}/transfer`,
    JSON.stringify({
      toAccountId: accountId(to),
      amount: 1 + Math.floor(Math.random() * 1000),
    }),
    {
      headers: {
        'x-account-id': accountId(from),
        'content-type': 'application/json',
      },
    },
  );
  return { response, from };
}

export function transfer() {
  postTransfer();
}

export function completion() {
  const startedAt = Date.now();
  const { response, from } = postTransfer();
  if (response.status !== 202) return;

  const url = `${BASE_URL}/transfer/${response.json('id')}`;
  const params = {
    headers: { 'x-account-id': accountId(from) },
    tags: { name: 'transfer_status' },
  };
  let wait = 0.05;
  while (Date.now() - startedAt < COMPLETION_TIMEOUT_SECONDS * 1000) {
    sleep(wait);
    const status = http.get(url, params).json('job.status');
    if (status !== 'pending') {
      completionTime.add(Date.now() - startedAt);
      return;
    }
    wait = Math.min(wait * 1.5, 2);
  }
  completionTimeouts.add(1);
}
