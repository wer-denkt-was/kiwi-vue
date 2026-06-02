<script setup lang="ts">
const props = defineProps<{
  stopPropagation?: boolean
  consoleLog?: 'warn' | 'error'
}>()

const emit = defineEmits<{
  'error-caught': [error: Error]
  'error-reset': [previousError: undefined | Error]
}>()

const slots = defineSlots<{
  default: () => unknown
  error?: (props: { error: Error; info: string; resetError: () => void }) => unknown
}>()

const caught = shallowRef<{ readonly error: Error; readonly info: string }>()

const resetError = () => {
  const reset = caught.value
  caught.value = undefined
  emit('error-reset', reset?.error)
}

onErrorCaptured((error, _vm, info) => {
  if (props.consoleLog) {
    const log = console[props.consoleLog]
    log(`ErrorBoundary caught error: "${info}"`, error)
  }

  caught.value = { error, info }
  emit('error-caught', error)

  if (props.stopPropagation) {
    return false
  }
})
</script>

<template>
  <slot v-if="!slots.error || !caught" name="default" />
  <slot v-if="slots.error && caught" name="error" :reset-error="resetError" v-bind="caught" />
</template>
