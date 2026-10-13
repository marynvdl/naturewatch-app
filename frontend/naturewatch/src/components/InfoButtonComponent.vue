<script setup lang="ts">
import { buildInfoCards, catalog } from '@/catalog';

/** Entries come from src/catalog/layers.json */
const cardData = buildInfoCards(catalog);
</script>

<template>
  <v-dialog width="1500">
    <template v-slot:activator="{ props }">
      <v-btn
        size="x-small"
        icon
        variant="flat"
        v-bind="props"
        title="More info"
      >
        <v-icon>mdi-information-variant</v-icon>
      </v-btn>
    </template>

    <template v-slot:default="{ isActive }">
      <v-card
        title="About Nature Watch"
        subtitle="We're all about presenting clear and accurate data layers of how we interact with the Earth from space. Found a better or more recent layer or have feedback? Send us an email at top.map4835@fastmail.com"
      >
        <template v-slot:append>
          <div class="me-n2">
            <v-btn
              @click="isActive.value = false"
              icon="$close"
              size="large"
              variant="text"
            />
          </div>
        </template>
        <v-scroll-y style="max-height: 80vh; overflow-y: auto">
          <v-expansion-panels variant="accordion">
            <template v-for="card in cardData" :key="card.title">
              <v-expansion-panel :readonly="!card.content">
                <v-expansion-panel-title class="py-0">
                  <v-card
                    variant="flat"
                    color="transparent"
                    class="ma-0 pa-0"
                    :prepend-icon="card.icon"
                  >
                    <template v-slot:title>
                      <div class="text-subtitle-1">{{ card.title }}</div>
                    </template>
                    <template v-slot:subtitle>
                      {{ card.subtitle }}
                    </template>
                  </v-card>
                </v-expansion-panel-title>
                <v-expansion-panel-text v-if="card.content" class="pb-2">
                  <!-- eslint-disable vue/no-v-html -->
                  <div class="text-body-2 px-5" v-html="card.content"/>
                  <!--eslint-enable-->
                  <img
                    v-if="card.image"
                    :src="card.image"
                    alt="Image"
                    class="pt-3 card-image"
                  />
                </v-expansion-panel-text>
              </v-expansion-panel>
            </template>
          </v-expansion-panels>
        </v-scroll-y>
      </v-card>
    </template>
  </v-dialog>
</template>

<style scoped>
.card-image {
  max-width: 350px;
}
</style>
