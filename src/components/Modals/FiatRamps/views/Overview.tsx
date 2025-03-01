import { CheckIcon, ChevronRightIcon, CopyIcon, ViewIcon } from '@chakra-ui/icons'
import {
  Box,
  Button,
  Center,
  Flex,
  IconButton,
  Input,
  InputGroup,
  InputRightElement,
  ModalBody,
  Stack,
  Text as RawText,
  useToast,
} from '@chakra-ui/react'
import type { AccountId } from '@shapeshiftoss/caip'
import {
  avalancheChainId,
  bchChainId,
  btcChainId,
  CHAIN_NAMESPACE,
  cosmosChainId,
  dogeChainId,
  ethChainId,
  fromAccountId,
  fromAssetId,
  fromChainId,
  ltcChainId,
} from '@shapeshiftoss/caip'
import type { ChainAdapterManager } from '@shapeshiftoss/chain-adapters'
import { DefiModalHeader } from 'features/defi/components/DefiModal/DefiModalHeader'
import type { Dispatch, SetStateAction } from 'react'
import { useEffect, useMemo, useState } from 'react'
import { FaCreditCard } from 'react-icons/fa'
import { useTranslate } from 'react-polyglot'
import { useParams } from 'react-router'
import { AccountDropdown } from 'components/AccountDropdown/AccountDropdown'
import { AssetIcon } from 'components/AssetIcon'
import { CircularProgress } from 'components/CircularProgress/CircularProgress'
import { IconCircle } from 'components/IconCircle'
import { Text } from 'components/Text'
import { useFeatureFlag } from 'hooks/useFeatureFlag/useFeatureFlag'
import { useWallet } from 'hooks/useWallet/useWallet'
import { bnOrZero } from 'lib/bignumber/bignumber'
import { logger } from 'lib/logger'
import type { ChainIdType } from 'state/slices/portfolioSlice/utils'
import {
  selectMarketDataById,
  selectPortfolioAccountBalances,
  selectPortfolioAccountMetadata,
} from 'state/slices/selectors'
import { useAppSelector } from 'state/store'
import type { Nullable } from 'types/common'

import { FiatRampActionButtons } from '../components/FiatRampActionButtons'
import { FiatRampButton } from '../components/FiatRampButton'
import type { FiatRampAsset } from '../FiatRampsCommon'
import { FiatRampAction } from '../FiatRampsCommon'
import { useFiatRampByAssetId } from '../hooks/useFiatRampByAssetId'
import { middleEllipsis } from '../utils'

type GenerateAddressProps = {
  selectedAsset: FiatRampAsset | null
  btcAddress: string
  bchAddress: string
  dogeAddress: string
  ltcAddress: string
  ethAddress: string
  avalancheAddress: string
  cosmosAddress: string
  ensName: string
}

type OverviewProps = GenerateAddressProps & {
  supportsAddressVerifying: boolean
  setSupportsAddressVerifying: Dispatch<SetStateAction<boolean>>
  onFiatRampActionClick: (fiatRampAction: FiatRampAction) => void
  onIsSelectingAsset: (asset: FiatRampAsset | null, selectAssetTranslation: string) => void
  chainId: ChainIdType
  setChainId: Dispatch<SetStateAction<ChainIdType>>
  chainAdapterManager: ChainAdapterManager
  handleAccountIdChange: (accountId: AccountId) => void
  accountId: Nullable<AccountId>
}

type AddressOrNameFull = string
type AddressFull = string
type AddressOrNameEllipsed = string
type GenerateAddressesReturn = [AddressOrNameFull, AddressFull, AddressOrNameEllipsed]
type GenerateAddresses = (props: GenerateAddressProps) => GenerateAddressesReturn

const generateAddresses: GenerateAddresses = props => {
  const {
    selectedAsset,
    btcAddress,
    bchAddress,
    dogeAddress,
    ltcAddress,
    avalancheAddress,
    ethAddress,
    ensName,
    cosmosAddress,
  } = props
  const assetId = selectedAsset?.assetId
  const empty: GenerateAddressesReturn = ['', '', '']
  if (!assetId) return empty
  const chainId = fromAssetId(assetId).chainId
  switch (chainId) {
    case avalancheChainId:
      return [avalancheAddress, avalancheAddress, middleEllipsis(avalancheAddress, 11)]
    case ethChainId:
      return [ensName || ethAddress, ethAddress, ensName || middleEllipsis(ethAddress, 11)]
    case btcChainId:
      return [btcAddress, btcAddress, middleEllipsis(btcAddress, 11)]
    case bchChainId:
      return [bchAddress, bchAddress, middleEllipsis(bchAddress, 11)]
    case dogeChainId:
      return [dogeAddress, dogeAddress, middleEllipsis(dogeAddress, 11)]
    case ltcChainId:
      return [ltcAddress, ltcAddress, middleEllipsis(ltcAddress, 11)]
    case cosmosChainId:
      return [cosmosAddress, cosmosAddress, middleEllipsis(cosmosAddress, 11)]
    default:
      return empty
  }
}

const moduleLogger = logger.child({
  namespace: ['Modals', 'FiatRamps', 'Views', 'Overview'],
})

export const Overview: React.FC<OverviewProps> = ({
  onIsSelectingAsset,
  onFiatRampActionClick,
  supportsAddressVerifying,
  setSupportsAddressVerifying,
  btcAddress,
  bchAddress,
  dogeAddress,
  ltcAddress,
  ethAddress,
  avalancheAddress,
  cosmosAddress,
  ensName,
  selectedAsset,
  chainId,
  setChainId,
  chainAdapterManager,
  handleAccountIdChange,
  accountId,
}) => {
  const translate = useTranslate()
  const { fiatRampAction } = useParams<{ fiatRampAction: FiatRampAction }>()
  const toast = useToast()
  const {
    state: { wallet },
  } = useWallet()
  const multiAccountsEnabled = useFeatureFlag('MultiAccounts')
  const [shownOnDisplay, setShownOnDisplay] = useState<Boolean | null>(null)
  const accountBalances = useAppSelector(selectPortfolioAccountBalances)
  const marketData = useAppSelector(state =>
    selectMarketDataById(state, selectedAsset?.assetId ?? ''),
  )
  const [accountAddress, setAccountAddress] = useState<string | null>(null)
  const { providers, loading: providersLoading } = useFiatRampByAssetId({
    assetId: selectedAsset?.assetId,
    action: fiatRampAction,
  })

  // TODO: change the following with `selectPortfolioAccountMetadataByAccountId`
  // once web/#2632 got merged
  const accountMetadata = useAppSelector(selectPortfolioAccountMetadata)

  useEffect(() => {
    if (!(wallet && accountId && selectedAsset)) return
    const { chainId: assetChainId } = fromAssetId(selectedAsset.assetId)
    const { chainId: accountChainId } = fromAccountId(accountId)
    // race condition between selected asset and selected account
    if (assetChainId !== accountChainId) return
    const chainAdapter = chainAdapterManager.get(assetChainId)
    if (!chainAdapter) return
    const accountMeta = accountMetadata[accountId]
    const accountType = accountMeta?.accountType
    const bip44Params = accountMeta?.bip44Params
    if (!bip44Params) return
    const { chainNamespace } = fromChainId(accountChainId)
    if (CHAIN_NAMESPACE.Utxo === chainNamespace && !accountType) return
    ;(async () => {
      try {
        const selectedAccountAddress = await chainAdapter.getAddress({
          wallet,
          accountType,
          bip44Params,
        })
        setAccountAddress(selectedAccountAddress)
      } catch (error) {
        moduleLogger.error(error, 'Error getting address')
      }
    })()
  }, [wallet, selectedAsset, chainAdapterManager, accountId, accountMetadata])

  const accountFiatBalance = useMemo(
    () =>
      bnOrZero(
        multiAccountsEnabled
          ? accountId && accountBalances[accountId][selectedAsset?.assetId ?? '']
          : selectedAsset?.cryptoBalance,
      ).times(marketData.price),
    [
      accountBalances,
      accountId,
      marketData.price,
      multiAccountsEnabled,
      selectedAsset?.assetId,
      selectedAsset?.cryptoBalance,
    ],
  )

  const [addressOrNameFull, addressFull, addressOrNameEllipsed] = generateAddresses({
    selectedAsset,
    btcAddress,
    bchAddress,
    ltcAddress,
    dogeAddress,
    ethAddress,
    avalancheAddress,
    cosmosAddress,
    ensName,
  })

  useEffect(() => {
    if (!wallet) return
    supportsAddressVerifying && setSupportsAddressVerifying(true)
    const maybeAssetId = selectedAsset?.assetId
    const chainId = maybeAssetId ? fromAssetId(maybeAssetId).chainId : ethChainId
    setChainId(chainId)
    // supportsAddressVerifying will cause infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAsset, setChainId, setSupportsAddressVerifying, wallet])

  const [selectAssetTranslation, assetTranslation, fundsTranslation] = useMemo(
    () =>
      fiatRampAction === FiatRampAction.Buy
        ? ['fiatRamps.selectAnAssetToBuy', 'fiatRamps.asset', 'fiatRamps.fundsTo']
        : ['fiatRamps.selectAnAssetToSell', 'fiatRamps.asset', 'fiatRamps.fundsFrom'],
    [fiatRampAction],
  )

  const handleCopyClick = async () => {
    const duration = 2500
    const isClosable = true
    const toastPayload = { duration, isClosable }
    try {
      await navigator.clipboard.writeText(addressOrNameFull)
      const title = translate('common.copied')
      const status = 'success'
      const description = addressOrNameFull
      toast({ description, title, status, ...toastPayload })
    } catch (e) {
      const title = translate('common.copyFailed')
      const status = 'error'
      const description = translate('common.copyFailedDescription')
      toast({ description, title, status })
    }
  }

  const handleVerify = async () => {
    const chainAdapter = chainAdapterManager.get(chainId)
    if (!(wallet && chainAdapter)) return
    const deviceAddress = await chainAdapter.getAddress({
      wallet,
      showOnDevice: true,
    })
    const shownOnDisplay =
      Boolean(deviceAddress) && (deviceAddress === ethAddress || deviceAddress === btcAddress)
    setShownOnDisplay(shownOnDisplay)
  }

  const renderProviders = useMemo(() => {
    return providers.length ? (
      providers.map(provider => (
        <FiatRampButton
          onClick={() =>
            provider.onSubmit(
              fiatRampAction,
              selectedAsset?.assetId || '',
              (multiAccountsEnabled ? accountAddress : addressFull) || '',
            )
          }
          accountFiatBalance={accountFiatBalance}
          action={fiatRampAction}
          {...provider}
        />
      ))
    ) : (
      <Center display='flex' flexDir='column' minHeight='150px'>
        <IconCircle mb={4}>
          <FaCreditCard />
        </IconCircle>
        <Text fontWeight='medium' translation='fiatRamps.noProvidersAvailable' fontSize='lg' />
        <Text translation='fiatRamps.noProvidersBody' color='gray.500' />
      </Center>
    )
  }, [
    accountAddress,
    accountFiatBalance,
    addressFull,
    fiatRampAction,
    multiAccountsEnabled,
    providers,
    selectedAsset?.assetId,
  ])

  return (
    <>
      <DefiModalHeader title={translate('fiatRamps.title')} />
      <FiatRampActionButtons action={fiatRampAction} setAction={onFiatRampActionClick} />
      <ModalBody display='flex' flexDir='column' gap={6} py={6}>
        <Stack spacing={4}>
          <Box>
            <Text fontWeight='medium' translation={assetTranslation} />
            <Text color='gray.500' translation='fiatRamps.selectBody' />
          </Box>
          <Button
            width='full'
            variant='outline'
            height='48px'
            justifyContent='space-between'
            onClick={() => onIsSelectingAsset(selectedAsset, selectAssetTranslation)}
            rightIcon={<ChevronRightIcon color='gray.500' boxSize={6} />}
          >
            {selectedAsset ? (
              <Flex alignItems='center'>
                <AssetIcon
                  boxSize={6}
                  src={selectedAsset.imageUrl}
                  assetId={selectedAsset.assetId}
                  mr={4}
                />
                <Box textAlign='left'>
                  <RawText lineHeight={1}>{selectedAsset.name}</RawText>
                </Box>
              </Flex>
            ) : (
              <Text translation={selectAssetTranslation} color='gray.500' />
            )}
          </Button>
          {selectedAsset && (
            <Flex flexDirection='column' mb='10px'>
              <Text translation={fundsTranslation} color='gray.500' mt='15px' mb='8px' />
              {multiAccountsEnabled ? (
                <AccountDropdown
                  assetId={selectedAsset.assetId}
                  onChange={handleAccountIdChange}
                  buttonProps={{ variant: 'solid' }}
                />
              ) : (
                <InputGroup size='md'>
                  <Input pr='4.5rem' value={addressOrNameEllipsed} readOnly />
                  <InputRightElement width={supportsAddressVerifying ? '4.5rem' : undefined}>
                    <IconButton
                      icon={<CopyIcon />}
                      aria-label='copy-icon'
                      size='sm'
                      isRound
                      variant='ghost'
                      onClick={handleCopyClick}
                    />
                    {supportsAddressVerifying && (
                      <IconButton
                        icon={shownOnDisplay ? <CheckIcon /> : <ViewIcon />}
                        onClick={handleVerify}
                        aria-label='check-icon'
                        size='sm'
                        color={
                          shownOnDisplay
                            ? 'green.500'
                            : shownOnDisplay === false
                            ? 'red.500'
                            : 'gray.500'
                        }
                        isRound
                        variant='ghost'
                      />
                    )}
                  </InputRightElement>
                </InputGroup>
              )}
            </Flex>
          )}
        </Stack>
        {selectedAsset && (
          <Stack spacing={4}>
            {providers.length && (
              <Box>
                <Text fontWeight='medium' translation='fiatRamps.availableProviders' />
                <Text
                  color='gray.500'
                  translation={[
                    'fiatRamps.titleMessage',
                    { action: fiatRampAction, asset: selectedAsset.symbol },
                  ]}
                />
              </Box>
            )}

            {providersLoading ? (
              <Center minHeight='150px'>
                <CircularProgress />
              </Center>
            ) : (
              <Stack>{renderProviders}</Stack>
            )}
          </Stack>
        )}
      </ModalBody>
    </>
  )
}
