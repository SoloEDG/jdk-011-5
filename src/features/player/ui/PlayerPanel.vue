<script setup lang="ts">
import { computed } from "vue";
import { Footprints, Navigation, Flag } from "lucide-vue-next";
import type { Workspace } from "../../../shared/document";
const props = defineProps<{ state: Workspace }>();
defineEmits<{ toggle: []; cancelNav: [] }>();
const remaining = computed(() =>
  props.state.nav
    ? Math.max(props.state.nav.path.length - props.state.nav.cursor, 0)
    : 0,
);
</script>
<template>
  <section class="panel">
    <div class="section-title">
      <h2>角色探索</h2>
      <Footprints :size="17" />
    </div>
    <div class="player-position">
      <span class="avatar-dot"><Navigation :size="18" /></span>
      <div>
        <b>探索者</b
        ><small
          >X {{ state.doc.player.x.toFixed(1) }} &nbsp; Y
          {{ state.doc.player.y.toFixed(1) }} &nbsp; Z
          {{ state.doc.player.z.toFixed(1) }}</small
        >
      </div>
      <i class="status-dot"></i>
    </div>
    <button
      :class="['soft', 'full', { selected: state.mode === 'walk' }]"
      @click="$emit('toggle')"
    >
      {{ state.mode === "walk" ? "返回建造模式" : "进入行走模式" }}
      <span>Tab</span>
    </button>
    <div v-if="state.nav" class="nav-box">
      <div class="nav-goal">
        <Flag :size="13" />
        <b
          >目的地 {{ state.nav.goal.x }}, {{ state.nav.goal.y }},
          {{ state.nav.goal.z }}</b
        >
      </div>
      <small class="muted">
        {{
          state.nav.status === "planning"
            ? "正在规划路线…"
            : `自动带路中 · 剩余 ${remaining} 段 · 已确认 ${state.nav.confirmed.length} 段`
        }}
      </small>
      <button class="soft full" @click="$emit('cancelNav')">
        停止带路 <span>Esc</span>
      </button>
    </div>
    <p class="small muted">
      W A S D 移动 · 空格跳跃<br />行走模式下点击方块，自动规划路线前往
    </p>
  </section>
</template>
