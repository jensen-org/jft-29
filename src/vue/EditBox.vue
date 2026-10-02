<script setup lang="ts">
import { onMounted, ref } from "vue";
import { splitName } from "../core/paths.js";

const props = defineProps<{ initial: string; label: string }>();
const emit = defineEmits<{
  commit: [name: string];
  blurCommit: [name: string];
  cancel: [];
}>();

const input = ref<HTMLInputElement | null>(null);
const value = ref(props.initial);
let settled = false;

onMounted(() => {
  const el = input.value;
  if (!el) return;
  el.focus({ preventScroll: true });
  el.setSelectionRange(0, splitName(props.initial).stem.length);
});

function commit(): void {
  emit("commit", value.value);
}

function cancel(): void {
  if (settled) return;
  settled = true;
  emit("cancel");
}

function blur(): void {
  if (settled) return;
  settled = true;
  if (value.value.trim()) emit("blurCommit", value.value);
  else emit("cancel");
}

function keydown(event: KeyboardEvent): void {
  if (event.key === "Enter") {
    event.preventDefault();
    commit();
  } else if (event.key === "Escape") {
    event.preventDefault();
    cancel();
  }
}

</script>

<template>
  <input
    ref="input"
    v-model="value"
    class="jft-edit"
    type="text"
    spellcheck="false"
    autocomplete="off"
    :aria-label="label"
    @keydown.stop="keydown"
    @click.stop
    @dblclick.stop
    @blur="blur"
  />
</template>
