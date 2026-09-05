<?php

namespace {{namespace}}\Bootstrap;

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

/**
 * Everything that happens at the plugin's lifecycle boundaries:
 * activation, deactivation, and the WooCommerce environment check both
 * of them depend on.
 */
class Lifecycle {

	const ERROR_MISSING_WC = 'missing_woocommerce';
	const ERROR_WC_TOO_OLD = 'wc_too_old';

	public static function activate(): void {
		$error = self::check_environment();

		if ( null !== $error ) {
			deactivate_plugins( plugin_basename( {{constant}}_FILE ) );
			wp_die(
				esc_html( self::environment_message( $error ) ),
				esc_html__( 'Plugin activation error', '{{textDomain}}' ),
				array( 'back_link' => true )
			);
		}

		update_option( '{{optionPrefix}}_version', {{constant}}_VERSION );
	}

	public static function deactivate(): void {}

	public static function check_environment(): ?string {
		if ( ! class_exists( 'WooCommerce' ) ) {
			return self::ERROR_MISSING_WC;
		}
		if ( defined( 'WC_VERSION' ) && version_compare( \WC_VERSION, {{constant}}_MIN_WC_VERSION, '<' ) ) {
			return self::ERROR_WC_TOO_OLD;
		}
		return null;
	}

	public static function print_environment_notice(): void {
		if ( ! current_user_can( 'activate_plugins' ) ) {
			return;
		}

		$error = self::check_environment();

		if ( null === $error ) {
			return;
		}
		?>
		<div class="notice notice-error">
			<p><?php echo esc_html( self::environment_message( $error ) ); ?></p>
		</div>
		<?php
	}

	private static function environment_message( string $error_code ): string {
		if ( self::ERROR_WC_TOO_OLD === $error_code ) {
			return sprintf(
				/* translators: 1: minimum WooCommerce version, 2: installed version */
				__( '{{namePhp}} requires WooCommerce %1$s or newer. You are running %2$s.', '{{textDomain}}' ),
				{{constant}}_MIN_WC_VERSION,
				defined( 'WC_VERSION' ) ? \WC_VERSION : 'unknown'
			);
		}

		return __( '{{namePhp}} requires WooCommerce to be installed and active.', '{{textDomain}}' );
	}
}
