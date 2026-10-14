import { describe, expect, it } from 'vitest';
import { secretKind } from '@/lib/secrets';

describe('secretKind: what auto-save never keeps', () => {
  it.each([
    ['-----BEGIN OPENSSH PRIVATE KEY-----\nb3BlbnNzaC1rZXktdjEAAAAA\n-----END OPENSSH PRIVATE KEY-----', 'private key'],
    ['-----BEGIN RSA PRIVATE KEY-----', 'private key'],
    ['AKIAIOSFODNN7EXAMPLE', 'access key'],
    ['aws_access_key_id = ASIAY34FZKBOKMUTVV7A', 'access key'],
    ['ghp_1234567890abcdefghijklmnopqrstuvwxyzAB', 'access key'],
    ['github_pat_11ABCDEFG0123456789_abcdefghijklmnop', 'access key'],
    ['sk-proj-abcdefghijklmnopqrstuvwxyz0123', 'access key'],
    ['sk-ant-api03-abcdefghijklmnopqrstuv', 'access key'],
    ['sk_live_4eC39HqLyjWDarjtT1zdp7dc', 'access key'],
    ['xoxb-123456789012-abcdefghijkl', 'access key'],
    ['AIzaSyA1234567890abcdefghijklmnopqrstuv', 'access key'],
    ['eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U', 'access key'],
    ['postgres://admin:s3cretPass@db.example.com:5432/app', 'password'],
    ['password: hunter2!x', 'password'],
    ['DB_PASSWORD=correct-horse-battery', 'password'],
    ['OPENAI_API_KEY="abcdef123456"', 'password'],
    ['Your login\nusername: sam\npassword: Tr0ub4dor&3', 'password'],
    ['4111 1111 1111 1111', 'card number'],
    ['Card: 5555-5555-5555-4444 exp 04/29', 'card number'],
    ['378282246310005', 'card number'],
  ])('%s', (text, kind) => {
    expect(secretKind(text)).toBe(kind);
  });

  it.each([
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'a94a8fe5ccb19ba61c4c0873d391e987982fbbd3',
    '#FF4A2B',
    '1Z 999 AA1 01 2345 6784',
    '9400 1000 0000 0000 0000 00',
    '+44 20 7946 0321',
    'Remember to change your password before Friday.',
    'const password = input.value;',
    'password: string;',
    'Order number 4111 1111 1111 1112',
    'Invoice 2026-10-13, total 1,234.56',
    'sk-short',
    'https://www.example.com/path?query=1',
    'mailto:sam@example.com',
    'The token is in the vault',
    'max_tokens: 1024000',
    'TOKEN_LIMIT=100000',
    'Token: expired',
    'Password: Required',
    'OLDPWD=/Users/sam',
    'pwd: /home/sam/projects',
    'secret_santa: https://gifts.example.com/draw',
    'password: string;',
    'token: process.env.TOKEN',
  ])('%s', (text) => {
    expect(secretKind(text)).toBeNull();
  });
});
