import { Strategy } from 'passport-saml'

// ===================================================================

const DEFAULTS = {
  disableRequestedAuthnContext: false,
}

export const configurationSchema = {
  description:
    'Important: When registering your instance to your identity provider, you must configure its callback URL to `https://<xo.company.net>/signin/saml/callback`!',
  type: 'object',
  properties: {
    cert: {
      title: 'Certificate',
      description: "Copy/paste the identity provider's certificate",
      type: 'string',
    },
    entryPoint: {
      title: 'Entry point',
      description: 'Entry point of the identity provider',
      type: 'string',
    },
    issuer: {
      title: 'Issuer',
      description: 'Issuer string to supply to the identity provider',
      type: 'string',
    },
    usernameField: {
      title: 'Username field',
      description: `Field to use as the XO username

You should try \`http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress\` if you are using Microsoft Azure Active Directory.
      `,
      type: 'string',
    },
    disableRequestedAuthnContext: {
      title: "Don't request an authentication context",
      description: 'This is known to help when using Active Directory',
      default: DEFAULTS.disableRequestedAuthnContext,
    },
  },
  required: ['cert', 'entryPoint', 'issuer', 'usernameField'],
}

// ===================================================================

class AuthSamlXoPlugin {
  constructor({ xo }) {
    this._conf = null
    this._usernameField = null
    this._xo = xo
  }

  configure({ usernameField, ...conf }) {
    this._usernameField = usernameField
    this._conf = {
      ...DEFAULTS,
      ...conf,

      // must match the callback URL
      path: '/signin/saml/callback',
    }
  }

  load() {
    const xo = this._xo

    xo.registerPassportStrategy(
      new Strategy(this._conf, async (profile, done) => {
        const name = profile[this._usernameField]
        if (!name) {
          console.warn('xo-server-auth-saml:', profile)
          done('no name found for this user')
          return
        }

        try {
          done(null, await xo.registerUser('saml', name))
        } catch (error) {
          done(error.message)
        }
      })
    )
  }
}

// ===================================================================

export default opts => new AuthSamlXoPlugin(opts)
