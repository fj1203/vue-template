<template>
 <div>
    <div class="App">hello world</div>
    <router-view></router-view>
 </div>
</template>
<script>
export default {
  name: "App",
  data() {
    return {};
  }
};
</script>
<style lang="scss" scoped>
.App {
  color: skyblue;
}
</style>