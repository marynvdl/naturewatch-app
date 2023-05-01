<script setup lang="ts">
import type DrawerMenuItem from '@/interfaces/DrawerMenuItemInterface';

/** Drawer menu items */
const homeItem: DrawerMenuItem = {
    title: 'Home',
    icon: 'mdi-home',
    isNav: true,
    to: { name: 'Home' },
}
const items: DrawerMenuItem[] = [
  {
    title: 'All',
    icon: 'mdi-map-legend',
    active: true,
    to: { name: 'Map-All' },
  },
  {
    title: '-', // Divider
  },
  {
    title: 'Group 1',
    items: [
      {
        title: 'Built',
        icon: 'mdi-office-building',
        to: { name: 'Map-Built' },
      },
      {
        title: 'Treeloss',
        icon: 'mdi-tree',
        to: { name: 'Map-Treeloss' },
      },
      {
        title: 'Fire',
        icon: 'mdi-fire',
        to: { name: 'Map-Fire' },
      },
      {
        title: 'Bare',
        icon: 'mdi-image-filter-hdr',
        to: { name: 'Map-Bare' },
      },
      {
        title: 'Mines',
        icon: 'mdi-pickaxe',
        to: { name: 'Map-Mines' },
      },
      {
        title: 'Crops',
        icon: 'mdi-barley',
        to: { name: 'Map-Crops' },
      }
    ],
  },
  {
    title: '-', // Divider
  },
  {
    title: 'Rivers',
    icon: 'mdi-map-minus',
    active: true,
    to: { name: 'Map-Rivers' },
  },
  {
    title: 'Group 2',
    items: [
      {
        title: 'Dams',
        icon: 'mdi-bridge',
        to: { name: 'Map-Dams' },
      },
    ]
  }
];
</script>

<template>
<v-list>
  <v-list-item nav
    :disabled="!homeItem.to"
    :prepend-icon="homeItem.icon"
    :to="homeItem.to"
    link
  />
</v-list>
<v-container>
    <template v-for="item in items" :key="item.title">
      <v-divider class="my-4" v-if="item.title === '-'" />
      <template v-else>
        <!-- Main Button Item -->
        <v-row 
          v-if="!item.items"
          align="center"
          justify="center">
            <v-col class="my-0" cols="auto">
              <div class="d-flex flex-column align-center">
                <v-btn 
                  :icon="item.icon"
                  block
                  rounded="lg"
                  size="100"
                />
                <span class="mb-0" style="font-size: 12px;">{{ item.title }}</span>
              </div>
            </v-col>
        </v-row>
        <!-- Groups with Sub Items -->
        <v-row v-else-if="item.items"
          align="center"
          justify="center">
          <template v-for="subItem in item.items" :key="subItem.title">
            <v-divider v-if="subItem.title === '-'" />
            <v-col v-else cols="auto">
              <div class="d-flex flex-column align-center">
                <v-btn
                  :icon="subItem.icon"
                  size="large"
                  rounded="lg"
                >
                <template v-slot:default>
                  <v-icon color="success"></v-icon>
                </template>
                </v-btn>
                <span class="mb-2" style="font-size: 12px;">{{ subItem.title }}</span>
              </div>
            </v-col>
          </template>
      </v-row>
      </template>
    </template>
    
  </v-container>
</template>
