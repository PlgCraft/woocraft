<?php
/**
 * Plugin Name:       {{name}}
 * Plugin URI:        {{pluginUri}}
 * Description:       {{description}}
 * Version:           0.1.0
 * Requires at least: {{requiresWP}}
 * Requires PHP:      {{requiresPHP}}
 * Requires Plugins:  woocommerce
 * WC requires at least: {{requiresWC}}
 * WC tested up to:   {{wcTestedUpTo}}
 * Author:            {{author}}
 * Author URI:        {{authorUri}}
 * Text Domain:       {{textDomain}}
 * Domain Path:       /languages
 * License:           GPL-2.0-or-later
 * License URI:       https://www.gnu.org/licenses/gpl-2.0.html
 *
 * @package {{namespace}}
 */

use {{namespace}}\Bootstrap\Lifecycle;
use {{namespace}}\Plugin;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

define( '{{constant}}_VERSION', '0.1.0' );
define( '{{constant}}_FILE', __FILE__ );
define( '{{constant}}_PATH', plugin_dir_path( __FILE__ ) );
define( '{{constant}}_URL', plugin_dir_url( __FILE__ ) );
define( '{{constant}}_MIN_WC_VERSION', '{{requiresWC}}' );

require_once {{constant}}_PATH . 'vendor/autoload.php';

register_activation_hook( __FILE__, array( Lifecycle::class, 'activate' ) );
register_deactivation_hook( __FILE__, array( Lifecycle::class, 'deactivate' ) );

/**
 * Declare compatibility with WooCommerce's HPOS and block cart/checkout.
 * Safe to declare from the start; drop a line here if the extension ever
 * touches orders through a non-HPOS-safe path.
 */
add_action(
	'before_woocommerce_init',
	static function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
		}
	}
);

add_action(
	'init',
	static function () {
		// This extension ships its own translations in /languages and is not
		// hosted on WordPress.org, so the loader is pointed there explicitly.
		// phpcs:ignore PluginCheck.CodeAnalysis.DiscouragedFunctions.load_plugin_textdomainFound
		load_plugin_textdomain( '{{textDomain}}', false, dirname( plugin_basename( __FILE__ ) ) . '/languages' );
	}
);

// Priority 20: WooCommerce also loads on plugins_loaded, and "{{slug}}"
// may sort before "woocommerce", so a default-priority check for the
// WooCommerce class could run before WooCommerce is available.
add_action( 'plugins_loaded', array( Plugin::class, 'boot' ), 20 );
