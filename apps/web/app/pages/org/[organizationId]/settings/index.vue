<script setup lang="ts">
definePageMeta({
  redirect: (to) => `/org/${String(to.params.organizationId)}/settings/general`,
})
</script>
