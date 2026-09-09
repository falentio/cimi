<script setup lang="ts">
definePageMeta({
  redirect: (to) => `/sites/${String(to.params.siteId)}/settings/general`,
})
</script>
