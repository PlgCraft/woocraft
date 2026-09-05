<?php

namespace {{namespace}}\Admin;

use const {{namespace}}\API_ENDPOINT;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Registers the wp-admin menu page and enqueues the Vite-built admin
 * app into it. The app mounts on <div id="{{rootId}}">; its API base
 * URL and REST nonce are handed over via wp_localize_script as
 * window.{{jsGlobal}}.
 */
class AdminMenu {

	const CAPABILITY    = 'manage_woocommerce';
	const PAGE_SLUG     = '{{slug}}';
	const SCRIPT_HANDLE = '{{scriptHandle}}';

	private string $hook_suffix = '';

	public function __construct() {
		add_action( 'admin_menu', array( $this, 'register_menu' ) );
		add_action( 'admin_enqueue_scripts', array( $this, 'enqueue_assets' ) );
		add_filter( 'script_loader_tag', array( $this, 'make_script_a_module' ), 10, 2 );
	}

	/**
	 * The bundle is an ES module (it uses import.meta.url to locate its
	 * own hashed assets), so it must be loaded with type="module".
	 */
	public function make_script_a_module( string $tag, string $handle ): string {
		if ( self::SCRIPT_HANDLE === $handle && false === strpos( $tag, 'type="module"' ) ) {
			$tag = str_replace( ' src=', ' type="module" src=', $tag );
		}
		return $tag;
	}

	public function register_menu(): void {
		$this->hook_suffix = add_menu_page(
			__( '{{namePhp}}', '{{textDomain}}' ),
			__( '{{namePhp}}', '{{textDomain}}' ),
			self::CAPABILITY,
			self::PAGE_SLUG,
			array( $this, 'render_page' ),
			'dashicons-store',
			56
		);
	}

	public function render_page(): void {
		echo '<div id="{{rootId}}"></div>';
	}

	public function enqueue_assets( string $hook ): void {
		if ( $hook !== $this->hook_suffix ) {
			return;
		}

		$js = 'src/Admin/dist/index.js';

		if ( file_exists( {{constant}}_PATH . $js ) ) {
			wp_enqueue_script(
				self::SCRIPT_HANDLE,
				{{constant}}_URL . $js,
				array(),
				self::asset_version( $js ),
				true
			);

			wp_localize_script(
				self::SCRIPT_HANDLE,
				'{{jsGlobal}}',
				array(
					'apiUrl' => esc_url_raw( rest_url( API_ENDPOINT ) ),
					'nonce'  => wp_create_nonce( 'wp_rest' ),
				)
			);
		}

		$css = 'src/Admin/dist/index.css';

		if ( file_exists( {{constant}}_PATH . $css ) ) {
			wp_enqueue_style(
				self::SCRIPT_HANDLE,
				{{constant}}_URL . $css,
				array(),
				self::asset_version( $css )
			);
		}
	}

	/**
	 * Cache-buster for a built asset: its mtime, so a rebuild is picked
	 * up without bumping the plugin version.
	 */
	private static function asset_version( string $relative_path ): string {
		$mtime = @filemtime( {{constant}}_PATH . $relative_path );

		return false !== $mtime ? (string) $mtime : {{constant}}_VERSION;
	}
}
