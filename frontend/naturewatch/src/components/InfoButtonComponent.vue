<script setup lang="ts">
import { ref } from 'vue';

const cardData = ref([
  {
    title: 'Built',
    subtitle: '2022, 2023',
    icon: 'mdi-office-building',
    content: 'For the 2023 layer, we used Google Open Buildings (2023) and rasterised polygons with a high confidence score (>=0.80). For countries without Google Open Buildings data (Chad, Mali, Libya, Morocco and Western Morocco), we substituted with the Global Human Settlement Layer data of 2020. The older built layers are made up of a combination of Google Open Buildings (2022 to 2021) and Google Dynamic World with the class equal to "built".'
  },
  {
    title: 'Treeloss',
    subtitle: '2016, 2017, 2018, 2019, 2020, 2021, 2022',
    icon: 'mdi-tree',
    content: 'The treeloss layer is Global Forest Watch\'s v1.9 UMD tree cover loss with the tree cover density higher than 30%'
  },
  {
    title: 'Fire',
    subtitle: '2016, 2017, 2018, 2019, 2020, 2021, 2022',
    icon: 'mdi-fire',
    content: 'We processed FIRMS data and calculated how many times a pixel burned in the year. We created 14-day periods and checked if a pixel burned during that time. Counting the number of 14-day periods a pixel burned, we calculated the total number of times it burned in the year. Thus, the maximum number is 26 times a pixel could have burned during the year. The legend is as follows: Yellow: burned one time (possibly natural or management fires). Light orange: burned 2-3 times (possibly people moving through). Red: burned more than 3 times (possibly agriculture, permanent settlements or people moving through frequently). Dark red: burned more than 8 times (possibly mines, volcanoes, or industry)'
  },
  {
    title: 'Bare',
    subtitle: 'Coming soon',
    icon: 'mdi-square-rounded',
    content: ''
  },
  {
    title: 'Mines',
    subtitle: 'Coming soon',
    icon: 'mdi-shovel',
    content: ''
  },
  {
    title: 'Crops',
    subtitle: '2015, 2018',
    icon: 'mdi-barley',
    content: 'We used Global cropland expansion in the 21st century and working to create layers for other years. (P. Potapov, S. Turubanova, M.C. Hansen, A. Tyukavina, V. Zalles, A. Khan, X.-P. Song, A. Pickens, Q. Shen, J. Cortez. (2021) Global maps of cropland extent and change show accelerated cropland expansion in the twenty-first century. Nature Food. https://doi.org/10.1038/s43016-021-00429-z)'
  },
  {
    title: 'Rivers',
    subtitle: 'Coming soon',
    icon: 'mdi-water',
    content: ''
  },
  {
    title: 'Dams',
    subtitle: 'Coming soon',
    icon: 'mdi-bridge',
    content: ''
  }
]);


</script>

<template>
    <v-dialog width="1500">
      <template v-slot:activator="{ props }">
        <v-btn size="x-small" icon variant="tonal" v-bind="props" title="More info">
          <v-icon>mdi-information-variant</v-icon>
        </v-btn>
      </template>
      
      <template v-slot:default="{ isActive }">
        <v-card title="About Nature Watch"
        subtitle="We aim to include the most accurate data layers showing our interaction with landscapes. Do you know of a more accurate or up to date layer? Let us know!">
            <template v-slot:append>
                <div class="me-n2">
                    <v-btn
                        @click="isActive.value = false"
                        icon="$close"
                        size="large"
                        variant="text"
                    ></v-btn>
                </div>
            </template>
            <v-scroll-y style="max-height: 80vh; overflow-y: auto;">
                <v-expansion-panels variant="accordion">
                    <template v-for="card in cardData" :key="card.title">
                        <v-expansion-panel :readonly="!card.content">
                            <v-expansion-panel-title class="py-0">
                                <v-card variant="flat" color="transparent" class="ma-0 pa-0" :prepend-icon="card.icon" >
                                <template v-slot:title>
                                <div class="text-subtitle-1">{{ card.title }}</div>
                                </template>
                                <template v-slot:subtitle>
                                {{ card.subtitle }}
                                </template>
                                </v-card>
                            </v-expansion-panel-title>
                            <v-expansion-panel-text v-if="card.content">
                                <div class="text-body-2">{{  card.content }}</div>
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
</style>
