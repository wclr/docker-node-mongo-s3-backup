import { execSync } from 'child_process'
import { Env } from '../src/run'

const env: Env = {
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_DEFAULT_REGION: process.env.AWS_DEFAULT_REGION,
  MONGO_URI: `mongodb://${process.env.DOCKER_HOST_IP}/charta-dev`,
  BACKUP_NAME: 'test',
  BACKUP_LOCAL_FOLDER: "backup",
  EXCLUDE_COLLECTIONS: 'sessions',
  AWS_BUCKET: 'bbooks-b-test/some',
  KEEP_LOCAL_BACKUPS_COUNT: '3',
  EMAIL_TO: 'alex.oshchepkov@gmail.com',
  EMAIL_FROM: 'mongod-db-backup@babeleo.com',
}

//execSync('ts-node run', { stdio: 'inherit', env })

execSync([
  `docker run --rm`,
  ...Object.keys(env).map((key: keyof Env) => `-e "${key}=${env[key]}"`),
  `whitecolor/node-mongo-s3-backup:1.0.0`
].join(' '),
  { stdio: 'inherit' }
)