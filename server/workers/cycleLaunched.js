/* eslint-disable prefer-arrow-callback */
import raven from 'raven'

import config from 'src/config'
import {formProjects} from 'src/server/actions/formProjects'
import intitiateProjectChannel from 'src/server/actions/intitiateProjectChannel'
import sendCycleLaunchAnnouncement from 'src/server/actions/sendCycleLaunchAnnouncement'
import getPlayerInfo from 'src/server/actions/getPlayerInfo'
import {findModeratorsForChapter} from 'src/server/db/moderator'
import {getTeamPlayerIds, getProjectsForChapterInCycle} from 'src/server/db/project'
import {update as updateCycle} from 'src/server/db/cycle'
import {parseQueryError} from 'src/server/db/errors'
import {GOAL_SELECTION} from 'src/common/models/cycle'
import {getQueue, getSocket} from 'src/server/util'
import ChatClient from 'src/server/clients/ChatClient'

const sentry = new raven.Client(config.server.sentryDSN)

export function start() {
  const cycleLaunched = getQueue('cycleLaunched')
  cycleLaunched.process(async function({data: cycle}) {
    try {
      await processCycleLaunch(cycle)
      console.log(`Cycle ${cycle.id} successfully launched`)
    } catch (err) {
      console.error('Cycle launch error:', err.stack)
      await _handleCycleLaunchError(cycle, err)
    }
  })
}

export async function processCycleLaunch(cycle, options = {}) {
  console.log(`Forming teams for cycle ${cycle.cycleNumber} of chapter ${cycle.chapterId}`)

  const chatClient = options.chatClient || new ChatClient()

  await formProjects(cycle.id)
  const projects = await getProjectsForChapterInCycle(cycle.chapterId, cycle.id)

  await Promise.all(projects.map(async project => {
    const playerIds = await getTeamPlayerIds(project, cycle.id)
    const players = await getPlayerInfo(playerIds)
    return intitiateProjectChannel(project, players, {chatClient})
  }))

  return sendCycleLaunchAnnouncement(cycle, projects, {chatClient})
}

async function _handleCycleLaunchError(cycle, err) {
  sentry.captureException(err)
  err = parseQueryError(err)

  const socket = getSocket()

  try {
    // reset cycle state to GOAL_SELECTION
    console.log(`Resetting state for cycle ${cycle.id} to GOAL_SELECTION`)
    await updateCycle({id: cycle.id, state: GOAL_SELECTION})
  } catch (err) {
    console.error('Cycle state reset error:', err)
  }

  // delete any projects that were created
  await getProjectsForChapterInCycle(cycle.chapterId, cycle.id).delete()

  try {
    console.log(`Notifying moderators of chapter ${cycle.chapterId} of cycle launch error`)
    await findModeratorsForChapter(cycle.chapterId).then(moderators => {
      moderators.forEach(moderator => {
        socket.publish(`notifyUser-${moderator.id}`, `❗️ **Cycle Launch Error:** ${err.message}`)
      })
    })
  } catch (err) {
    console.error('Moderator notification error:', err)
  }
}
