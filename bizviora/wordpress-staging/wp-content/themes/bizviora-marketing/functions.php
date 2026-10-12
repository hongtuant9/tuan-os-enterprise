<?php
if (!defined('ABSPATH')) { exit; }
add_action('after_setup_theme', function() {
 add_theme_support('title-tag'); add_theme_support('post-thumbnails'); add_theme_support('html5', ['search-form','comment-form','comment-list','gallery','caption','style','script']);
 register_nav_menus(['primary' => __('Primary navigation','bizviora-marketing')]);
});
add_action('wp_enqueue_scripts', function() {
 wp_enqueue_style('bizviora-marketing', get_stylesheet_uri(), [], wp_get_theme()->get('Version'));
});
add_action('admin_notices', function() {
 if (current_user_can('manage_options')) {
  echo '<div class="notice notice-info"><p>'.esc_html__('BIZVIORA Marketing theme is a staging design. Lead capture is disabled until a reviewed secure receiver and privacy policy are configured.','bizviora-marketing').'</p></div>';
 }
});
