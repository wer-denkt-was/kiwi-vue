<script setup lang="ts" generic="T">
import type { LoadingService, LoadingState } from '@/services'

defineSlots<{
  idle(): unknown
  pending(props: { previousData: undefined | T }): unknown
  loaded(props: { data: T }): unknown
  failed(props: { error: unknown }): unknown
  unknown(props: { unreachable: never }): unknown
}>()

const props = defineProps<{ state: LoadingState<T> | LoadingService<T> }>()

const result = computed((): LoadingState<T> => {
  return 'state' in props.state ? props.state.state.value : props.state
})
</script>

<template>
  <slot v-if="result.loading === 'idle'" name="idle" />
  <slot v-else-if="result.loading === 'pending'" :previous-data="result.previousResult" name="pending" />
  <slot v-else-if="result.loading === 'loaded'" :data="result.result" name="loaded" />
  <slot v-else-if="result.loading === 'failed'" :error="result.error" name="failed" />
  <slot v-else name="unknown" :unreachable="result" />
</template>
