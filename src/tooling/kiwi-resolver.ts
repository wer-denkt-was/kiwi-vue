import type { ComponentResolver } from 'unplugin-vue-components'
import * as KiwiComponents from '@/components'
import { name as packageName } from '../../package.json'

export function KiwiResolver(): ComponentResolver {
  return {
    type: 'component',
    resolve: name => {
      if (name in KiwiComponents) {
        return { name, from: `${packageName}/components` }
      }
    },
  }
}
