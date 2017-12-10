import { execSync } from 'child_process'
import { readdirSync, unlinkSync, existsSync, mkdirSync } from 'fs'
import { join, basename } from 'path'

export interface EnvParams {
  MONGO_URI: string
  HOST: string
  PORT: string
  USERNAME: string
  PASSWORD: string
  DB: string
  COLLECTION: string
  EXCLUDE_COLLECTIONS: string
  BACKUP_NAME: string
  BACKUP_LOCAL_FOLDER: string
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  AWS_DEFAULT_REGION: string
  AWS_BUCKET: string,
  EMAIL_TO: string,
  EMAIL_FROM: string,
  EMAIL_ONLY_ON_ERROR: string,
  KEEP_LOCAL_BACKUPS_COUNT: string
  KEEP_REMOTE_BACKUPS_COUNT: string
  ARCHIVE: string,
  EXTRA_OPTIONS: string
}

export type Env = Partial<EnvParams>

const env = (process.env as any) as Env

const exec = (cmd: string) => {
  console.log(`Executing ${cmd}`)
  execSync(cmd, { stdio: 'inherit' })
}

const sendEmail = (subject: string, message: string) => {
  if (!env.EMAIL_FROM || !env.EMAIL_TO) {
    return
  }
  exec([`aws ses send-email`,
    `--destination ToAddresses="${env.EMAIL_TO}"`,
    `--message Subject={Data="${subject}",Charset="UTF-8"},Body={Text={"Data=${message}",Charset="UTF-8"}}`,
    `--from "${env.EMAIL_FROM}"`
  ].join(' '))
}

const currentDate = new Date()
const currentDateSufix = currentDate.toISOString()
  .replace(/\..*$/, '').replace(/:/g, '_')
const backupFolder = env.BACKUP_LOCAL_FOLDER || 'backup'
const backupName = (env.BACKUP_NAME || env.DB || 'mongodump')
  + (env.ARCHIVE ? '.archive' : '')
const checkDateSufix = currentDateSufix.split(':')[0]
const bakcupArchiveName = [backupName, currentDateSufix]
  .join('.')
const bakcupArchiveFolderPath = [backupFolder, bakcupArchiveName].join('/')
const bakcupArchiveFilePath = `${bakcupArchiveFolderPath}.zip`

if (!existsSync(backupFolder)) mkdirSync(backupFolder)

const uploadBackupToS3 = (bakcupArchivePath: string) => {
  if (!env.AWS_BUCKET) {
    console.log('No AWS_BUCKET set.')
    return
  }
  const s3Path = `s3://${env.AWS_BUCKET}/${basename(bakcupArchivePath)}`
  const s3cmd = `aws s3 cp ${bakcupArchivePath} ${s3Path}`
  exec(s3cmd)
}

const removeOldLocalBackups = () => {
  const backupArchives = readdirSync(backupFolder).filter(f => f.match(/.zip$/))
  const maxBackupsCount = parseInt(env.KEEP_LOCAL_BACKUPS_COUNT!) || 10
  const getDateFromArchiveName = (name: string) => {
    return new Date(name.match(/([\d_T-]*)\.zip$/)![1].replace(/_/g, ':'))
  }
  
  if (backupArchives.length >= maxBackupsCount) {
    const sortedBackups = backupArchives.map(name => ({ name, date: getDateFromArchiveName(name) }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .map(x => x.name).slice(0, -maxBackupsCount)
    console.log('Removing old backups', sortedBackups)
    const toRemove = sortedBackups.map(fileName =>
      join(backupFolder, fileName.replace(/\.zip/, '*'))
    ).join(' ')
    exec(`rm -rf ${toRemove}`)
  }
}

const getCredParams = () => {
  return env.MONGO_URI ? `--uri "${env.MONGO_URI}"` : [
    `--host ${env.HOST}`,
    ...env.PORT ? [`--port ${env.PORT}`] : [],
    `--db ${env.DB}`,
    `--username ${env.USERNAME}`,
    `--password ${env.PASSWORD}`,
  ].join(' ')
}

const backupMongo = () => {
  const collection = env.COLLECTION
  const excludeCollections = (env.EXCLUDE_COLLECTIONS || '').split(',')
    .filter(_ => _)

  const mongoCmd = ['mongodump',
    getCredParams(),
    ...collection ? [`--collection ${collection}`] : [],
    ...excludeCollections.map(col => `--excludeCollection ${col}`),
    env.ARCHIVE
      ? `--archive="${bakcupArchiveFilePath}" --gzip`
      : `--out="${bakcupArchiveFolderPath}"`,
    `${env.EXTRA_OPTIONS || ''}`
  ].join(' ')

  exec(mongoCmd)

  if (!env.ARCHIVE) {
    exec(`tar -cvf ${bakcupArchiveFilePath} ${bakcupArchiveFolderPath}`)
  }
}

try {
  backupMongo()
  uploadBackupToS3(bakcupArchiveFilePath)
  removeOldLocalBackups()
  const mongoMessageUri = env.MONGO_URI
    ? env.MONGO_URI.split('@')[0]
    : `mongodb://${env.HOST}${env.PORT ? ':' + env.PORT : ''}/${env.DB}`

  const message = `Backup of ${mongoMessageUri} completed and uploaded.`
  if (!env.EMAIL_ONLY_ON_ERROR) {
    sendEmail(`Mongo backup (${backupName}) completed.`,
      message
    )
  }
  console.log(message)
} catch (err) {
  sendEmail(
    `Error occurred while mongo backup (${backupName}).`,
    err.message || err
  )
}
