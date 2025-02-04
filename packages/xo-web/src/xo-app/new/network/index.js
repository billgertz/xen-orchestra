import _, { messages } from 'intl'
import ActionButton from 'action-button'
import Button from 'button'
import classNames from 'classnames'
import decorate from 'apply-decorators'
import Icon from 'icon'
import PropTypes from 'prop-types'
import React, { Component } from 'react'
import Wizard, { Section } from 'wizard'
import { addSubscriptions, connectStore } from 'utils'
import {
  createBondedNetwork,
  createNetwork,
  createPrivateNetwork,
  getBondModes,
  subscribePlugins,
} from 'xo'
import {
  createGetObject,
  createGetObjectsOfType,
  getIsPoolAdmin,
} from 'selectors'
import { injectIntl } from 'react-intl'
import { injectState, provideState } from 'reaclette'
import { linkState } from 'reaclette-utils'
import { map } from 'lodash'
import { Select, Toggle } from 'form'
import { SelectPif, SelectPool } from 'select-objects'

import Page from '../../page'
import styles from './index.css'

const EMPTY = {
  bonded: false,
  bondMode: undefined,
  description: '',
  encapsulation: 'gre',
  encrypted: false,
  isPrivate: false,
  mtu: '',
  name: '',
  networks: [],
  pif: undefined,
  pifs: [],
  vlan: '',
}

const LineItem = ({ children }) => (
  <div className={styles.lineItem}>{children}</div>
)

const Item = ({ label, children, className }) => (
  <span className={styles.item}>
    {label && (
      <span>
        {label}
        &nbsp;
      </span>
    )}
    <span className={classNames(styles.input, className)}>{children}</span>
  </span>
)

const NewNetwork = decorate([
  addSubscriptions({
    plugins: subscribePlugins,
  }),
  connectStore(() => ({
    isPoolAdmin: getIsPoolAdmin,
    nPools: createGetObjectsOfType('pool').count(),
    pool: createGetObject((_, props) => props.location.query.pool),
  })),
  injectIntl,
  provideState({
    initialState: () => ({ ...EMPTY, bondModes: undefined }),
    effects: {
      addPool() {
        const { state } = this
        state.networks = [
          ...state.networks,
          { pool: undefined, pif: undefined },
        ]
      },
      onChangeNetwork(_, key, pool, pif) {
        const networks = [...this.state.networks]
        const entry = networks[key]
        if (pool !== undefined) {
          entry.pool = pool
        }
        if (pif !== undefined) {
          entry.pif = pif
        }
        this.state.networks = networks
      },
      initialize: async () => ({ bondModes: await getBondModes() }),
      linkState,
      onChangeMode: (_, bondMode) => ({ bondMode }),
      onChangePif: (_, value) => ({ bonded }) =>
        bonded ? { pifs: value } : { pif: value },
      onChangeEncapsulation(_, encapsulation) {
        return { encapsulation: encapsulation.value }
      },
      onDeletePool(_, { currentTarget: { dataset } }) {
        const networks = [...this.state.networks]
        networks.splice(dataset.position, 1)
        this.state.networks = networks
      },
      reset: () => EMPTY,
      toggleBonded() {
        const { bonded, isPrivate } = this.state
        return {
          ...EMPTY,
          bonded: !bonded,
          isPrivate: bonded ? isPrivate : false,
        }
      },
      togglePrivate() {
        const { bonded, isPrivate } = this.state
        return {
          ...EMPTY,
          isPrivate: !isPrivate,
          bonded: isPrivate ? bonded : false,
        }
      },
      toggleEncrypted() {
        return { encrypted: !this.state.encrypted }
      },
    },
    computed: {
      disableAddPool: ({ networks }, { nPools }) =>
        networks.length >= nPools - 1,
      modeOptions: ({ bondModes }) =>
        bondModes !== undefined
          ? bondModes.map(mode => ({
              label: mode,
              value: mode,
            }))
          : [],
      pifPredicate: (_, { pool }) => pif =>
        pif.vlan === -1 && pif.$host === (pool && pool.master),
      pifPredicateSdnController: (_, { pool }) => pif =>
        pif.physical &&
        pif.ip_configuration_mode !== 'None' &&
        pif.bond_slave_of === 'OpaqueRef:NULL' &&
        pif.$host === (pool && pool.master),
      networkPifPredicate: ({ networks }) => (pif, key) => {
        const pool = networks[key].pool
        return (
          pif.physical &&
          pif.ip_configuration_mode !== 'None' &&
          pif.bond_slave_of === 'OpaqueRef:NULL' &&
          pif.$host === (pool !== undefined && pool.master)
        )
      },
      networkPoolPredicate: ({ networks }, { pool: rootPool }) => (
        pool,
        index
      ) =>
        pool.id !== rootPool.id &&
        !networks.some(
          ({ pool: networksPool = {} }, networksIndex) =>
            pool.id === networksPool.id && index !== networksIndex
        ),
      isSdnControllerLoaded: (state, { plugins = [] }) =>
        plugins.some(
          plugin => plugin.name === 'sdn-controller' && plugin.loaded
        ),
    },
  }),
  injectState,
  class extends Component {
    static contextTypes = {
      router: PropTypes.object,
    }

    _create = () => {
      const { pool, state } = this.props
      const {
        bonded,
        bondMode,
        isPrivate,
        description,
        encapsulation,
        encrypted,
        mtu,
        name,
        networks,
        pif,
        pifs,
        vlan,
      } = state
      return bonded
        ? createBondedNetwork({
            bondMode: bondMode.value,
            description,
            mtu,
            name,
            pifs: map(pifs, 'id'),
            pool: pool.id,
          })
        : isPrivate
        ? (() => {
            const poolIds = [pool.id]
            const pifIds = [pif.id]
            for (const network of networks) {
              poolIds.push(network.pool.id)
              pifIds.push(network.pif.id)
            }
            return createPrivateNetwork({
              poolIds,
              pifIds,
              name,
              description,
              encapsulation,
              encrypted,
              mtu: mtu !== '' ? +mtu : undefined,
            })
          })()
        : createNetwork({
            description,
            mtu,
            name,
            pif: pif == null ? undefined : pif.id,
            pool: pool.id,
            vlan,
          })
    }

    _selectPool = pool => {
      const {
        effects,
        location: { pathname },
      } = this.props
      effects.reset()
      this.context.router.push({
        pathname,
        query: pool !== null && { pool: pool.id },
      })
    }

    _renderHeader = () => {
      const { isPoolAdmin, pool } = this.props
      return (
        <h2>
          {isPoolAdmin
            ? _('createNewNetworkOn', {
                select: (
                  <span className={styles.inlineSelect}>
                    <SelectPool onChange={this._selectPool} value={pool} />
                  </span>
                ),
              })
            : _('createNewNetworkNoPermission')}
        </h2>
      )
    }

    render() {
      const { state, effects, intl, pool } = this.props
      const {
        bonded,
        bondMode,
        isPrivate,
        description,
        encapsulation,
        encrypted,
        modeOptions,
        mtu,
        name,
        pif,
        pifPredicate,
        pifPredicateSdnController,
        pifs,
        vlan,
        isSdnControllerLoaded,
      } = state
      const { formatMessage } = intl
      return (
        <Page header={this._renderHeader()}>
          {pool !== undefined && (
            <form id='networkCreation'>
              <Wizard>
                <Section icon='network' title='newNetworkType'>
                  <div>
                    <Toggle onChange={effects.toggleBonded} value={bonded} />{' '}
                    <label>{_('bondedNetwork')}</label>
                  </div>
                  <div>
                    <Toggle
                      disabled={!isSdnControllerLoaded}
                      onChange={effects.togglePrivate}
                      value={isPrivate}
                    />{' '}
                    <label>{_('privateNetwork')}</label>
                    <div>
                      <em>
                        <Icon icon='info' />{' '}
                        <a href='https://xen-orchestra.com/docs/sdn_controller.html#requirements'>
                          {_('newNetworkSdnControllerTip')}
                        </a>
                      </em>
                    </div>
                  </div>
                </Section>
                <Section icon='info' title='newNetworkInfo'>
                  <div className='form-group'>
                    <label>{_('newNetworkInterface')}</label>
                    <SelectPif
                      multi={bonded}
                      onChange={effects.onChangePif}
                      predicate={
                        isPrivate ? pifPredicateSdnController : pifPredicate
                      }
                      required={bonded || isPrivate}
                      value={bonded ? pifs : pif}
                    />
                    <label>{_('newNetworkName')}</label>
                    <input
                      className='form-control'
                      name='name'
                      onChange={effects.linkState}
                      required
                      type='text'
                      value={name}
                    />
                    <label>{_('newNetworkDescription')}</label>
                    <input
                      className='form-control'
                      name='description'
                      onChange={effects.linkState}
                      type='text'
                      value={description}
                    />
                    <label>{_('newNetworkMtu')}</label>
                    <input
                      className='form-control'
                      name='mtu'
                      onChange={effects.linkState}
                      placeholder={formatMessage(messages.newNetworkDefaultMtu)}
                      type='text'
                      value={mtu}
                    />
                    {isPrivate ? (
                      <div>
                        <label>{_('newNetworkEncapsulation')}</label>
                        <Select
                          name='encapsulation'
                          onChange={effects.onChangeEncapsulation}
                          options={[
                            { label: 'GRE', value: 'gre' },
                            { label: 'VxLAN', value: 'vxlan' },
                          ]}
                          value={encapsulation}
                        />
                        <Toggle
                          onChange={effects.toggleEncrypted}
                          value={encrypted}
                        />{' '}
                        <label>{_('newNetworkEncrypted')}</label>
                        <div>
                          <em>
                            <Icon icon='info' /> {_('encryptionWarning')}
                          </em>
                        </div>
                        <div className='mt-1'>
                          {state.networks.map(({ pool, pif }, key) => (
                            <div key={key}>
                              <LineItem>
                                <Item label={_('homeTypePool')}>
                                  <span className={styles.inlineSelect}>
                                    <SelectPool
                                      onChange={value =>
                                        effects.onChangeNetwork(key, value)
                                      }
                                      value={pool}
                                      predicate={pool =>
                                        state.networkPoolPredicate(pool, key)
                                      }
                                      required
                                    />
                                  </span>
                                </Item>
                                <Item label={_('pif')}>
                                  <span className={styles.inlineSelect}>
                                    <SelectPif
                                      onChange={value =>
                                        effects.onChangeNetwork(
                                          key,
                                          undefined,
                                          value
                                        )
                                      }
                                      value={pif}
                                      predicate={pif =>
                                        state.networkPifPredicate(pif, key)
                                      }
                                      required
                                    />
                                  </span>
                                </Item>
                                <Item>
                                  <Button
                                    onClick={effects.onDeletePool}
                                    data-position={key}
                                  >
                                    <Icon icon='new-vm-remove' />
                                  </Button>
                                </Item>
                              </LineItem>
                            </div>
                          ))}
                          <ActionButton
                            handler={effects.addPool}
                            disabled={state.disableAddPool}
                            icon='add'
                          >
                            {_('addPool')}
                          </ActionButton>
                        </div>
                      </div>
                    ) : (
                      <div>
                        {bonded ? (
                          <div>
                            <label>{_('newNetworkBondMode')}</label>
                            <Select
                              onChange={effects.onChangeMode}
                              options={modeOptions}
                              required
                              value={bondMode}
                            />
                          </div>
                        ) : (
                          <div>
                            <label>{_('newNetworkVlan')}</label>
                            <input
                              className='form-control'
                              name='vlan'
                              onChange={effects.linkState}
                              placeholder={formatMessage(
                                messages.newNetworkDefaultVlan
                              )}
                              type='text'
                              value={vlan}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </Section>
              </Wizard>
              <div className='form-group pull-right'>
                <ActionButton
                  btnStyle='primary'
                  className='mr-1'
                  form='networkCreation'
                  handler={this._create}
                  icon='new-network-create'
                  redirectOnSuccess={`pools/${pool.id}/network`}
                >
                  {_('newNetworkCreate')}
                </ActionButton>
                <ActionButton handler={effects.reset} icon='reset'>
                  {_('formReset')}
                </ActionButton>
              </div>
            </form>
          )}
        </Page>
      )
    }
  },
])
export { NewNetwork as default }
