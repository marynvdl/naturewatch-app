<script setup lang="ts">
import { ref } from 'vue';
import { Layers, Search } from '@lucide/vue';
import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import { Input } from '@/components/ui/input';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/ui/segmented-control';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

const place = ref('');
const satellite = ref(true);
const year = ref([2020]);
const view = ref('split');
</script>

<template>
  <div class="nw nw:min-h-screen nw:bg-background nw:text-foreground">
    <div
      class="nw:mx-auto nw:flex nw:max-w-3xl nw:flex-col nw:gap-stack nw:px-panel nw:py-panel"
    >
      <header class="nw:flex nw:flex-col nw:gap-control">
        <p class="nw:text-sm nw:text-muted-foreground">Visual system</p>
        <h1 class="nw:text-2xl nw:font-medium nw:tracking-tight">
          Nature Watch
        </h1>
        <p
          class="nw:max-w-xl nw:text-sm nw:leading-relaxed nw:text-muted-foreground"
        >
          White panels, thin grey dividers, and charcoal actions. Warm grey
          marks what is on: the selected view, the enabled toggle, and the
          current year.
        </p>
      </header>

      <section
        class="nw:flex nw:flex-col nw:gap-stack nw:border nw:border-border nw:bg-white nw:p-panel"
      >
        <div class="nw:flex nw:flex-wrap nw:items-center nw:gap-control">
          <Button>Save place</Button>
          <Button variant="outline">Cancel</Button>
          <Button variant="ghost">Clear</Button>
          <IconButton label="Search">
            <Search />
          </IconButton>
          <IconButton label="Layers" variant="default">
            <Layers />
          </IconButton>
        </div>

        <div class="nw:flex nw:max-w-sm nw:flex-col nw:gap-control nw:text-sm">
          <p id="place-name-label">Place name</p>
          <Input
            v-model="place"
            placeholder="Search places"
            aria-labelledby="place-name-label"
          />
        </div>

        <div
          class="nw:flex nw:items-center nw:justify-between nw:gap-panel nw:border-t nw:border-border nw:pt-stack"
        >
          <div>
            <p class="nw:text-sm">Satellite</p>
            <p class="nw:text-sm nw:text-muted-foreground">
              Warm grey means this layer is on.
            </p>
          </div>
          <Switch id="satellite" v-model="satellite" aria-label="Satellite" />
        </div>

        <div class="nw:flex nw:flex-col nw:gap-control nw:text-sm">
          <p id="year-label">Year {{ year[0] }}</p>
          <Slider
            v-model="year"
            :min="2000"
            :max="2024"
            :step="1"
            aria-labelledby="year-label"
          />
        </div>

        <SegmentedControl v-model="view" type="single" variant="outline">
          <SegmentedControlItem value="map">Map</SegmentedControlItem>
          <SegmentedControlItem value="list">List</SegmentedControlItem>
          <SegmentedControlItem value="split">Split</SegmentedControlItem>
        </SegmentedControl>

        <Popover>
          <PopoverTrigger as-child>
            <Button variant="outline" class="nw:w-fit">Menu</Button>
          </PopoverTrigger>
          <PopoverContent class="nw:gap-control" align="start">
            <p class="nw:text-sm nw:font-medium">Basemap</p>
            <p class="nw:text-sm nw:text-muted-foreground">
              A flat panel. No shadow, 4px corners, and a zinc divider.
            </p>
            <Button variant="ghost" class="nw:justify-start nw:px-2">
              Streets
            </Button>
            <Button variant="ghost" class="nw:justify-start nw:px-2">
              Satellite
            </Button>
          </PopoverContent>
        </Popover>
      </section>

      <section class="nw:border nw:border-border nw:bg-white">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Place</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Size</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow data-state="selected">
              <TableCell>Addo Elephant</TableCell>
              <TableCell>National park</TableCell>
              <TableCell>1,640 km²</TableCell>
            </TableRow>
            <TableRow>
              <TableCell>Table Mountain</TableCell>
              <TableCell>National park</TableCell>
              <TableCell>221 km²</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>
    </div>
  </div>
</template>
