<script setup lang="ts">
import { ref } from 'vue';
import fireLegend from '@/assets/fire_legend.png';

const cardData = ref([
  {
    title: 'All',
    subtitle: 'Coming soon',
    icon: 'mdi-home-city',
    content: ''
  },  
  {
    title: 'Built',
    subtitle: '2022',
    icon: 'mdi-office-building',
    content: 'For the 2022 built layer, we primarily used the <a href="https://sites.research.google/open-buildings/" target="_blank">Google Open Buildings (2023)</a> dataset, specifically polygons with a high confidence score (>=0.80). In areas where Google Open Buildings data were unavailable—specifically in <b>Chad, Mali, Libya, Morocco and Western Morocco</b>—we integrated data from the <a href="https://ghsl.jrc.ec.europa.eu/ghs_buS2023.php" target="_blank">Global Human Settlement Layer</a> from 2020. For reference, older built layers combine data from Google Open Buildings (spanning 2022 to 2021) and Google Dynamic World, specifically the "built" class.'
  },
  {
    title: 'Treeloss',
    subtitle: '2016, 2017, 2018, 2019, 2020, 2021, 2022',
    icon: 'mdi-tree',
    content: 'The treeloss layer sources its data from <a href="https://www.globalforestwatch.org/" target="_blank">Global Forest Watch</a>\'s  v1.9 UMD tree cover loss dataset. Specifically, we\'ve focused on areas with a tree cover density exceeding 30%.'
  },
  {
    title: 'Fire',
    subtitle: '2016, 2017, 2018, 2019, 2020, 2021, 2022',
    icon: 'mdi-fire',
    image: fireLegend,
    content: `For the fire layers, we utilised <a href="https://firms.modaps.eosdis.nasa.gov/map/" target="_blank">FIRMS</a> data to determine the number of times a pixel burned in the year. Our methodology involved first dividing the year into 14-day intervals and then assessing if a pixel burned within each 14-day period. Finally, we summed up the number of 14-day periods a pixel experienced a fire. As a result, the maximum count for a pixel is 26 burn events within a year.
    The data is visualised as follows:
    <ul>
    <li> Light yellow: Pixel burned once, suggesting potential natural occurrences or management fires.</li>
    <li> Orange: Pixel burned 2-3 times, possibly indicating human activity or transit.</li>
    <li> Red: Pixel burned more than 3 times, hinting at agriculture, consistent human presence, or frequent transit.</li>
    <li> Dark red: Pixel burned over 8 times, which may suggest industrial activities, mines, or volcanic activity.</li>
</ul>
    `
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
    content: 'We sourced data from the <a href="https://glad.umd.edu/dataset/croplands" target="_blank">Global Cropland Expansion in the 21st Century</a> dataset. We are currently working to expand our layers with information from other years'
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
        <v-btn size="x-small" icon variant="flat" v-bind="props" title="More info">
          <v-icon>mdi-information-variant</v-icon>
        </v-btn>
      </template>
      
      <template v-slot:default="{ isActive }">
        <v-card title="About Nature Watch"
        subtitle="We're all about presenting clear and accurate data layers of how we interact with the Earth from space. Found a better or more recent layer or have feedback? Send us an email at top.map4835@fastmail.com">
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
                            <v-expansion-panel-text v-if="card.content" class="pb-2">
                              <!-- eslint-disable vue/no-v-html -->
                                <div class="text-body-2 px-5" v-html="card.content"></div>
                              <!--eslint-enable-->
                              <img v-if="card.image" :src="card.image" alt="Image" class="pt-3 card-image">
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
